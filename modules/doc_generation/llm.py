"""
llm.py — v3: Multi-backend support (Ollama + Groq) + Batch Generation
======================================================================
Optimizations:
  1. Groq backend for 10-20x faster inference
  2. Batch generation mode - all slides in ONE call
  3. Automatic fallback: Groq → Ollama
  4. Streaming support for progress feedback
"""

import json
import asyncio
import logging
import os
import re
from pathlib import Path
import sys
import httpx
from modules.core.llm_cache import get_cached, set_cached
from modules.core.retry_utils import retry_async, RateLimitHandler, RETRYABLE_STATUS_CODES

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from modules.core.config_loader import CONFIG

log = logging.getLogger("llm")
if not log.hasHandlers():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
        datefmt="%H:%M:%S",
    )


class LLMEngine:
    def __init__(self, namespace="common"):
        self.namespace = namespace
        # Ollama config (fallback)
        self.ollama_url = CONFIG["llm"]["api_url"]
        self.ollama_model = CONFIG["llm"]["model"]
        
        # Groq config (primary if available)
        # Load all available Groq keys for rotation
        self.groq_api_keys = [
            k for k in [
                os.getenv("GROQ_API_KEY", ""),
                os.getenv("GROQ_API_KEY_2", ""),
                os.getenv("GROQ_API_KEY_3", ""),
            ] if k
        ]
        self.groq_api_key = self.groq_api_keys[0] if self.groq_api_keys else ""
        self._groq_key_index = 0

        self.groq_model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        self.groq_url = "https://api.groq.com/openai/v1/chat/completions"
        
        # Gemini config (secondary fallback)
        self.gemini_api_key = os.getenv("GEMINI_API_KEY", "")
        self.gemini_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"


        # General config
        self.temp = CONFIG["llm"]["temperature"]
        self.ctx_len = min(CONFIG["llm"]["context_length"], 4096)
        self.judge_model = CONFIG["llm"].get("judge_model", self.ollama_model)
        self.judge_enabled = CONFIG["llm"].get("judge_enabled", False)
        
        # Backend selection
        self.backend = "groq" if self.groq_api_key else "ollama"
        log.info(f"LLM Backend: {self.backend.upper()}")
        # Rate limit handler
        self._rate_limiter = RateLimitHandler(base_delay=1.0)

        # Shared HTTP clients — reused across calls to avoid per-request TCP handshakes
        self._http_client        = httpx.AsyncClient(timeout=120.0)
        self._http_client_ollama = httpx.AsyncClient(timeout=600.0)

        # Lazy asyncio.Lock for Groq key rotation (created on first async call)
        self._groq_key_lock: asyncio.Lock | None = None

    async def aclose(self) -> None:
        """Release shared HTTP clients. Call on server shutdown."""
        await self._http_client.aclose()
        await self._http_client_ollama.aclose()

    # ══════════════════════════════════════════════════════════════════════════
    # GROQ BACKEND (Primary - Fast)
    # ══════════════════════════════════════════════════════════════════════════
    
    async def _call_groq(self, prompt: str, model: str = None, json_mode: bool = True) -> str:
        """Call Groq API with caching and retry logic."""
        model = model or self.groq_model

        # Check cache first
        cached = get_cached(prompt, model, namespace=self.namespace)
        if cached:
            log.info(f"  ⚡ Cache HIT for Groq ({model})")
            return cached

        # Lazy-init lock — must be created inside the running event loop
        if self._groq_key_lock is None:
            self._groq_key_lock = asyncio.Lock()
        
        headers = {
            "Authorization": f"Bearer {self.groq_api_key}",
            "Content-Type": "application/json",
        }
        
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": "You are an expert AI teaching assistant. Always respond with valid JSON."},
                {"role": "user", "content": prompt}
            ],
            "temperature": self.temp,
            "max_tokens": 4096,
        }
        
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
            
        fallback_models = [
            self.groq_model,
            "llama-3.1-8b-instant",
            "mixtral-8x7b-32768",
            "gemma2-9b-it",
            "llama-3.2-3b-preview"
        ]
        
        async def _make_request() -> str:
            # Recompute model in case of fallback
            current_model = payload["model"]
            headers["Authorization"] = f"Bearer {self.groq_api_key}"

            response = await self._http_client.post(self.groq_url, json=payload, headers=headers)

            # Handle rate limiting (429) & input/output cap violations (400)
            if response.status_code in (429, 400):
                reason = "Rate limited" if response.status_code == 429 else "Context/Format limit"
                async with self._groq_key_lock:
                    # Try next Groq key first
                    next_index = self._groq_key_index + 1
                    if next_index < len(self.groq_api_keys):
                        self._groq_key_index = next_index
                        self.groq_api_key = self.groq_api_keys[next_index]
                        log.warning(f"Groq {current_model} key {next_index} {reason} — switching to key {next_index + 1}")
                        raise ConnectionError("Switching Groq key, retrying...")
                    else:
                        # If keys exhausted, switch to next model and reset keys
                        # Each model has a separate quota bucket on Groq!
                        try:
                            current_model_idx = fallback_models.index(current_model)
                        except ValueError:
                            current_model_idx = -1

                        next_model_idx = current_model_idx + 1
                        if next_model_idx < len(fallback_models):
                            new_model = fallback_models[next_model_idx]
                            payload["model"] = new_model
                            self._groq_key_index = 0
                            self.groq_api_key = self.groq_api_keys[0]
                            log.warning(f"All Groq keys {reason} for {current_model} — switching model to {new_model} & resetting keys")
                            raise ConnectionError("Switching Groq model, retrying...")

                        log.warning(f"All Groq keys and fallback models {reason} — falling back to Gemini")
                        raise ConnectionError("ALL_KEYS_EXHAUSTED")

            # Handle other retryable errors
            if response.status_code in RETRYABLE_STATUS_CODES:
                raise ConnectionError(f"Server error {response.status_code}")

            if not response.is_success:
                log.error(f"Groq API Error {response.status_code}: {response.text}")

            response.raise_for_status()
            self._rate_limiter.reset()  # Success — reset rate limiter

            data = response.json()
            choices = data.get("choices") or []
            if not choices or not isinstance(choices[0].get("message"), dict):
                log.error(f"Groq unexpected response shape: {str(data)[:200]}")
                raise ValueError("Groq response missing choices/message")
            result = choices[0]["message"].get("content", "").strip()

            # Cache successful response
            set_cached(prompt, current_model, result, namespace=self.namespace)

            return result
        
        try:
            return await retry_async(
                _make_request,
                max_attempts=len(self.groq_api_keys) * len(fallback_models) + 1,
                base_delay=0.5,
            )
        
        except Exception as e:
            if "ALL_KEYS_EXHAUSTED" in str(e):
                log.warning("All Groq keys exhausted — falling back to Gemini")
                return await self._call_gemini(prompt)
            if "gemini" in str(e).lower() or "429" in str(e):
                log.error(f"Both Groq and Gemini failed: {e}")
                return "{}"
            log.warning(f"Groq failed ({e}) — falling back to Gemini")
            return await self._call_gemini(prompt)

        
     
        
        
    # ══════════════════════════════════════════════════════════════════════════
    # Gemini BACKEND (Fallback - Cloud)
    # ══════════════════════════════════════════════════════════════════════════   
    async def _call_gemini(self, prompt: str) -> str:
        """Call Gemini API as fallback with exponential-backoff retry on rate limits."""
        cached = get_cached(prompt, "gemini", namespace=self.namespace)
        if cached:
            log.info("  ⚡ Cache HIT for Gemini")
            return cached

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": self.temp, 
                "maxOutputTokens": 2048,
                "responseMimeType": "application/json"
            }
        }

        for attempt in range(3):
            response = await self._http_client.post(
                f"{self.gemini_url}?key={self.gemini_api_key}",
                json=payload
            )
            if response.status_code == 429:
                delay = 2.0 * (2 ** attempt)   # 2s, 4s, 8s
                log.warning(f"Gemini rate limited — retrying in {delay:.0f}s (attempt {attempt + 1}/3)")
                await asyncio.sleep(delay)
                continue
            if not response.is_success:
                log.error(f"Gemini error {response.status_code}: {response.text[:300]}")
                response.raise_for_status()
            data = response.json()
            candidates = data.get("candidates") or []
            if not candidates:
                log.error(f"Gemini unexpected response shape: {str(data)[:200]}")
                break
            parts = (candidates[0].get("content") or {}).get("parts") or []
            if not parts:
                log.error(f"Gemini response missing parts: {str(data)[:200]}")
                break
            result = parts[0].get("text", "").strip()

            if "```" in result:
                start = result.find("```")
                end = result.rfind("```")
                if start != end:
                    result = result[start+3:end].strip()
                    if result.startswith("json"):
                        result = result[4:].strip()
            set_cached(prompt, "gemini", result, namespace=self.namespace)
            log.info("✔ Gemini response received")
            return result

        log.error("Gemini: all 3 attempts rate-limited — giving up")
        return "{}"
    

    # ══════════════════════════════════════════════════════════════════════════
    # OLLAMA BACKEND (Fallback - Local)
    # ══════════════════════════════════════════════════════════════════════════
    
    async def _call_ollama(self, prompt: str, model: str, json_mode: bool = True) -> str:
        """Call local Ollama API with caching."""
        # Check cache first
        cached = get_cached(prompt, model, namespace=self.namespace)
        if cached:
            log.info(f"  ⚡ Cache HIT for Ollama ({model})")
            return cached

        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": self.temp,
                "num_ctx": self.ctx_len,
                "num_predict": -1,
            },
        }
        if json_mode:
            payload["format"] = "json"

        for attempt in range(2):
            try:
                response = await self._http_client_ollama.post(self.ollama_url, json=payload)
                response.raise_for_status()
                result = response.json().get("response", "").strip()

                # Cache successful response
                if result:
                    set_cached(prompt, model, result, namespace=self.namespace)

                return result

            except httpx.ConnectError as e:
                raise RuntimeError(f"Cannot reach Ollama at {self.ollama_url}") from e

            except httpx.HTTPStatusError as e:
                if "CUDA error" in e.response.text and attempt == 0:
                    payload["options"]["num_ctx"] = max(512, self.ctx_len // 2)
                    await asyncio.sleep(3)
                    continue
                raise

        return ""

    # ══════════════════════════════════════════════════════════════════════════
    # UNIFIED INTERFACE
    # ══════════════════════════════════════════════════════════════════════════
    
    async def generate_async(
        self,
        query: str,
        context_chunks: list,
        prompt_override: str = None,
        model_override: str = None,
    ) -> str:
        """Main generation call - routes to best available backend."""
        if not context_chunks and not prompt_override:
            return "{}"
        
        prompt = prompt_override or self._build_prompt(query, context_chunks)
        
        if self.backend == "groq":
            model = model_override if model_override in ["llama-3.3-70b-versatile", "mixtral-8x7b-32768", "llama-3.1-8b-instant"] else self.groq_model
            log.info(f"Generating with Groq ({model})")
            return await self._call_groq(prompt, model)
        else:
            model = model_override or self.ollama_model
            log.info(f"Generating with Ollama ({model})")
            return await self._call_ollama(prompt, model)

    # ══════════════════════════════════════════════════════════════════════════
    # IDEA EXTRACTION — Split a section's content into distinct ideas
    # ══════════════════════════════════════════════════════════════════════════

    async def extract_ideas_from_section(
        self,
        section_name: str,
        chunks_text: str,
        max_ideas: int = 3,
        language: str = "English",
    ) -> list[str]:
        """
        Given a section name and its raw chunk text, extract 2-3 distinct ideas.
        Returns a list of short focus descriptions (one per idea).
        """
        prompt = f"""You are analyzing a section of a textbook called "{section_name}".

Here is the content of this section:
{chunks_text[:3000]}

Your task: identify exactly {max_ideas} COMPLETELY DIFFERENT ideas in this section.

STRICT RULES:
- Each idea must cover a DIFFERENT page range or sub-topic from the text above
- Idea 2 must NOT mention any concept, dataset, figure, or formula already in Idea 1
- Idea 3 must NOT mention anything already in Ideas 1 or 2
- Each idea must be a different ASPECT: e.g. Idea 1 = theory/definition, Idea 2 = implementation/code, Idea 3 = limitations/tradeoffs
- Use specific terms from the text (formulas, class names, dataset names, figure numbers)
- Each idea description must be 15-25 words and mention at least ONE specific term from the text
- If you cannot find {max_ideas} truly different ideas, return fewer

Return a JSON object:
{{
  "ideas": [
    "Idea 1: [theory/definition aspect — 15-25 words with specific terms from the text]",
    "Idea 2: [implementation/code aspect — 15-25 words, NO overlap with Idea 1, different specific terms]",
    "Idea 3: [limitations/examples aspect — 15-25 words, NO overlap with Ideas 1-2, different specific terms]"
  ]
}}

Language: {language}"""

        try:
            raw = await self.generate_async("", [], prompt_override=prompt)
            data = json.loads(raw)
            ideas = data.get("ideas", [])
            # Clean and limit
            ideas = [str(i).strip() for i in ideas if str(i).strip()][:max_ideas]
            log.info(f"Extracted {len(ideas)} ideas from section '{section_name[:40]}'")
            return ideas
        except Exception as e:
            log.warning(f"Idea extraction failed for '{section_name}': {e}")
            return []

    # ══════════════════════════════════════════════════════════════════════════
    # BATCH GENERATION - All slides in ONE call
    # ══════════════════════════════════════════════════════════════════════════
    
    async def generate_all_slides_batch(
        self,
        query: str,
        context_text: str,
        num_slides: int,
        language: str = "English",
        available_images: list = None,
        image_contexts: dict = None,
        section_outline: list = None,
    ) -> list[dict]:
        """
        Generate ALL slides in a single LLM call.
        Much faster than sequential generation (1 call vs N calls).
        """
        
        # We no longer pass available images to the LLM to save tokens.
        # The python backend (image_matcher) perfectly handles image linking
        # by regex-matching the Figure references in the generated text!
        image_block = ""
        
        outline_block = ""
        if section_outline:
            lines = []
            for j, entry in enumerate(section_outline):
                if isinstance(entry, dict):
                    lines.append(f"  {j+1}. {entry['section']} — FOCUS: {entry['focus']}")
                else:
                    lines.append(f"  {j+1}. {entry}")
            outline_lines = "\n".join(lines)
            outline_block = f"""
DOCUMENT STRUCTURE — one slide per entry below:
{outline_lines}
"""

        # Extract figure references present in the context so the LLM can
        # naturally reference them in paragraphs — the image_matcher then
        # assigns the actual image via regex on the generated text.
        figure_refs = re.findall(
            r'(?:Figure|Fig\.|Table)\s+([\d]+(?:[-\.][\d]+)*)',
            context_text, re.IGNORECASE
        )
        figure_hint = ""
        if figure_refs:
            unique_figs = list(dict.fromkeys(figure_refs))[:8]
            figure_hint = f"\nFIGURES IN SOURCE: {', '.join(unique_figs)} — mention the relevant ones naturally in your paragraphs.\n"

        # Detect multiple source files from chunk metadata already in context_text
        source_files = list(dict.fromkeys(re.findall(r'\[Source:\s*([^,\]]+\.(?:pdf|docx|txt))', context_text, re.IGNORECASE)))
        multi_source_rule = ""
        if len(source_files) > 1:
            src_list = ", ".join(source_files[:4])
            log.info(f"Multi-source context detected: {src_list}")
            multi_source_rule = (
                f"\n7. MULTIPLE SOURCES: This context contains content from: {src_list}. "
                f"When two sources explain the same concept differently or complementarily, "
                f"briefly note the distinction in the paragraph "
                f"(e.g., 'While {source_files[0]} defines X as..., {source_files[1]} emphasizes Y...'). "
                f"Only do this when there is a genuine difference worth noting — do not force attribution on every slide."
            )

        prompt = f"""You are an expert AI teaching assistant creating an educational presentation.

Generate exactly {num_slides} slides about: {query}
Language: {language}

CONTEXT FROM DOCUMENTS:
{context_text}
{figure_hint}
{outline_block}
OUTPUT FORMAT — return a JSON object with this exact structure:
{{
  "slides": [
    {{
      "slide_type": "title|intro|concept|example|comparison|summary",
      "title": "Specific descriptive title (5-10 words)",
      "paragraph": "200-350 words explaining the concept in teaching language",
      "key_points": [
        {{"text": "Key highlight from this section (10-25 words)", "source_id": "Page X"}}
      ],
      "page_range": "Page X or Pages X-Y",
      "visual_hint": "none",
      "image_id": null,
      "speaker_notes": "One sentence for the presenter"
    }}
  ]
}}

RULES:
1. SLIDE STRUCTURE: Slide 1 = type "title" (empty paragraph, empty key_points). Slide 2 = type "intro" (2-3 sentences, 40-60 words, no formulas or figures). Slides 3 to {num_slides - 1} = content slides. Last slide = type "summary" — paragraph must be a synthesis of what was covered: name 3-4 specific concepts from the content slides (not the intro), state their significance, and end with a forward-looking sentence. FORBIDDEN in summary: do not copy or paraphrase the intro slide. Do not use the phrases "this presentation covered" or "we explored". Under 80 words.
2. CONTENT PARAGRAPHS: Every content slide (slides 3 to {num_slides - 1}) needs a paragraph of 200-350 words. Explain HOW things work and WHY, not just WHAT they are. Use specific terms, mechanisms, and examples from the source.
3. KEY POINTS: 3-5 highlights per content slide, each 10-25 words. Each key point must add a specific fact NOT already stated in the opening sentence of the paragraph — a threshold, a mechanism, a named algorithm step, a specific comparison, or a concrete example. FORBIDDEN: do not restate the paragraph's first sentence in shorter form.
4. TITLES: Write a specific, descriptive title that reflects the actual concept covered — not the raw section label. If a FOCUS is specified in the outline, the title must reflect that focus.
5. NO REPETITION: Each slide introduces new information. If two entries share a section name, their FOCUS fields define what makes them different — treat them as completely separate slides covering different sub-topics.
6. FAITHFULNESS: All content in {language}. Every claim must be grounded in the provided context above. Do not invent facts.{multi_source_rule}

Generate the {num_slides} slides now as valid JSON:"""

        try:
            raw = await self.generate_async(query, [], prompt_override=prompt)
            data = json.loads(raw)
            slides = data.get("slides", [])
            
            if len(slides) < num_slides:
                log.warning(f"Batch generation returned {len(slides)}/{num_slides} slides")
            
            log.info(f"✔ Batch generated {len(slides)} slides in one call")
            return slides
            
        except json.JSONDecodeError as e:
            log.error(f"Batch generation JSON parse failed: {e}")
            return []
        except Exception as e:
            log.error(f"Batch generation failed: {e}")
            return []

    # ══════════════════════════════════════════════════════════════════════════
    # JUDGE (Optional quality check)
    # ══════════════════════════════════════════════════════════════════════════
    
    async def judge_async(self, slide_json: dict) -> dict:
        """Rate slide quality. Returns {"score": 1-10, "feedback": str}."""
        if not self.judge_enabled:
            return {"score": 10, "feedback": "judge disabled"}
        
        judge_prompt = f"""Rate this teaching slide on specificity and accuracy (1-10).
Slide: {json.dumps(slide_json, ensure_ascii=False)}

Return JSON: {{"score": <1-10>, "feedback": "<one sentence>"}}"""
        
        try:
            if self.backend == "groq":
                raw = await self._call_groq(judge_prompt, "llama-3.1-8b-instant")
            else:
                raw = await self._call_ollama(judge_prompt, self.judge_model)
            
            result = json.loads(raw)
            return {"score": int(result.get("score", 7)), "feedback": result.get("feedback", "")}
        except Exception as e:
            log.warning(f"Judge failed: {e}")
            return {"score": 7, "feedback": "judge error"}

    # ══════════════════════════════════════════════════════════════════════════
    # HELPERS
    # ══════════════════════════════════════════════════════════════════════════
    
    def _build_prompt(self, query: str, context_chunks: list) -> str:
        context_text = "".join(f"- {c.text}\n" for c in context_chunks)
        return f"""You are an expert AI Teaching Assistant.
Synthesize the context into a concise answer using ONLY the provided context.

=== CONTEXT ===
{context_text}
=== END CONTEXT ===

QUESTION: {query}

ANSWER (as JSON):"""

    # Sync fallback for CLI
    def generate(self, query: str, context_chunks: list, prompt_override: str = None, model_override: str = None) -> str:
        import asyncio
        return asyncio.run(self.generate_async(query, context_chunks, prompt_override, model_override))


# ══════════════════════════════════════════════════════════════════════════════
# QUICK TEST
# ══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    import asyncio
    
    async def test():
        engine = LLMEngine()
        print(f"Backend: {engine.backend}")
        print(f"Groq Key: {'✓' if engine.groq_api_key else '✗'}")
        
        # Test simple generation
        result = await engine.generate_async(
            "What is machine learning?",
            [],
            prompt_override='Return JSON: {"answer": "brief explanation"}'
        )
        print(f"Response: {result[:200]}")
    
    asyncio.run(test())