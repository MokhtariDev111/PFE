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
    def __init__(self):
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

    # ══════════════════════════════════════════════════════════════════════════
    # GROQ BACKEND (Primary - Fast)
    # ══════════════════════════════════════════════════════════════════════════
    
    async def _call_groq(self, prompt: str, model: str = None, json_mode: bool = True, use_cache: bool = True) -> str:
        """Call Groq API with caching and retry logic."""
        import httpx
        
        model = model or self.groq_model
        
        # Skip cache for large batch prompts (always unique, never hit)
        if use_cache:
            cached = get_cached(prompt, model)
            if cached:
                log.debug(f"  ⚡ Cache HIT Groq ({model})")
                return cached
        
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
            
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(self.groq_url, json=payload, headers=headers)
                
                # Handle rate limiting (429) & input/output cap violations (400)
                if response.status_code in (429, 400):
                    reason = "Rate limited" if response.status_code == 429 else "Context/Format limit"
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
                result = data["choices"][0]["message"]["content"].strip()
                
                # Cache successful response
                set_cached(prompt, current_model, result)
                
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
        """Call Gemini API as fallback."""
        import httpx

        cached = get_cached(prompt, "gemini")
        if cached:
            log.info("  ⚡ Cache HIT for Gemini")
            return cached

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": self.temp, "maxOutputTokens": 2048}
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{self.gemini_url}?key={self.gemini_api_key}",
                json=payload
            )
            if not response.is_success:
                log.error(f"Gemini error {response.status_code}: {response.text[:300]}")
                response.raise_for_status()
            data = response.json()
            result = data["candidates"][0]["content"]["parts"][0]["text"].strip()

            if "```" in result:
                start = result.find("```")
                end = result.rfind("```")
                if start != end:
                    result = result[start+3:end].strip()
                    if result.startswith("json"):
                        result = result[4:].strip()
            set_cached(prompt, "gemini", result)
            log.info("✔ Gemini response received")
            return result
    

    # ══════════════════════════════════════════════════════════════════════════
    # OLLAMA BACKEND (Fallback - Local)
    # ══════════════════════════════════════════════════════════════════════════
    
    async def _call_ollama(self, prompt: str, model: str, json_mode: bool = True) -> str:
        """Call local Ollama API with caching."""
        import httpx
        import asyncio
        
        # Check cache first
        cached = get_cached(prompt, model)
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
                async with httpx.AsyncClient(timeout=600.0) as client:
                    response = await client.post(self.ollama_url, json=payload)
                    response.raise_for_status()
                    result = response.json().get("response", "").strip()
                    
                    # Cache successful response
                    if result:
                        set_cached(prompt, model, result)
                    
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
        use_cache: bool = True,
    ) -> str:
        """Main generation call - routes to best available backend."""
        if not context_chunks and not prompt_override:
            return "{}"
        
        prompt = prompt_override or self._build_prompt(query, context_chunks)
        
        if self.backend == "groq":
            model = model_override if model_override in ["llama-3.3-70b-versatile", "mixtral-8x7b-32768", "llama-3.1-8b-instant"] else self.groq_model
            log.debug(f"Groq ({model})  cache={use_cache}")
            return await self._call_groq(prompt, model, use_cache=use_cache)
        else:
            model = model_override or self.ollama_model
            log.debug(f"Ollama ({model})")
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
                    # Idea-level entry: {section, focus}
                    lines.append(f"  {j+1}. {entry['section']} — FOCUS: {entry['focus']}")
                else:
                    lines.append(f"  {j+1}. {entry}")
            outline_lines = "\n".join(lines)
            outline_block = f"""
DOCUMENT STRUCTURE (sections and their specific focus for each slide):
{outline_lines}

CRITICAL RULES FOR THE OUTLINE ABOVE:
- Create EXACTLY one slide per entry. The outline has {len(section_outline)} content entries → you generate {len(section_outline) + 2} slides total (slide 1 = title, slides 2 to {len(section_outline) + 1} = content from outline, last slide = summary).
- Each entry's FOCUS is a HARD CONSTRAINT. Write ONLY about that focus. Do not bleed content from one entry into another.
- For the title field: do NOT copy the section label verbatim. Write a short, descriptive title (5-10 words) that tells the student exactly what concept this slide explains.
- If two entries share the same section name, they MUST cover completely different sub-topics as specified by their FOCUS. Treat them as entirely separate slides with zero content overlap.
- BEFORE writing each slide, mentally check: "Did I already explain this concept in a previous slide?" If yes, skip it and find something new from the context.
"""

        # NEW: Extract figure references from context and tell LLM to include them
        figure_refs = re.findall(r'(?:see |shown in |refer to )?(?:Figure|Fig\.|Table)\s+([\d]+[-\.][\d]+)', context_text, re.IGNORECASE)
        figure_block = ""
        if figure_refs:
            unique_figs = list(dict.fromkeys(figure_refs))  # Remove duplicates, preserve order
            figure_block = f"""
FIGURES MENTIONED IN SOURCE:
The context mentions these figures: {', '.join(unique_figs)}
You MUST include these figure references in your paragraphs where relevant. Copy them exactly as "Figure X-Y" or "Table X-Y".
"""

        prompt = f"""You are an expert AI teaching assistant creating an educational presentation.

Generate exactly {num_slides} slides about: {query}

Language: {language}

CONTEXT FROM DOCUMENTS:
{context_text}

{outline_block}
{figure_block}

OUTPUT FORMAT - Return a JSON object with this exact structure:
{{
  "slides": [
    {{
      "slide_type": "title|intro|concept|example|comparison|summary",
      "title": "Section title from the document",
      "paragraph": "A clear, well-written paragraph of 250-450 words that explains the section content in simple teaching language. This is the MAIN content of the slide. Write it as if explaining to a student — use the document's facts, terms, examples, and mechanisms. Go into depth: explain WHY things work, not just WHAT they are.",
      "key_points": [
        {{"text": "One key highlight from this section", "source_id": "Page X"}},
        {{"text": "Another key highlight", "source_id": "Page Y"}}
      ],
      "page_range": "Page X" or "Pages X–Y",
      "visual_hint": "none",
      "image_id": null,
      "speaker_notes": "Brief note for presenter"
    }}
  ]
}}

RULES:
1. Slide 1: type "title", empty paragraph "", empty key_points [].
2. Slide 2: type "intro". Write a SHORT, non-technical overview (2-3 sentences max, 40-60 words). Just answer: what is this topic and why does it matter? Do NOT include formulas, figures, or technical details in the intro slide.
3. PARAGRAPH is mandatory for all content slides (slides 3 to last-1). Write 250-450 words per paragraph. Be thorough — explain mechanisms, give examples, mention tradeoffs. A student should be able to understand the concept deeply from this paragraph alone. AVOID generic statements like "X is widely used" or "X is important" — instead explain HOW it works and WHY it behaves that way.
4. KEY POINTS: 3-5 short highlights (10-30 words each) that complement the paragraph. These are the most important facts from the section.
5. PAGE RANGE: Track which pages the content comes from. If one page: "Page 84". If multiple: "Pages 84–86".
6. Each slide covers ONE section from the document outline. Use the section as a TOPIC HINT only — write a clear, descriptive title that captures what the slide is actually about (not the raw section label). Good titles are specific: "How Decision Trees Split Data" not "Decision Trees". If a FOCUS is specified, the title must reflect that focus.
7. STRICT NO REPETITION: Each slide must introduce NEW information. If a FOCUS is given, it defines exactly what is new. Never write about the same concept as a previous slide even if the section title is the same.
8. CRITICAL: When the context mentions a figure (e.g. "see Figure 2-22" or "shown in Figure 2-11"), you MUST include that EXACT figure reference in your paragraph. Copy the figure reference verbatim from the source. ONLY reference figures that appear in the context chunks provided for this slide. Do NOT reference figures from other sections or slides — if Figure 2-31 is not in this slide's context, do not mention it.
9. Slide types: title → intro → concept/example/comparison (based on content) → summary.
10. All content must be in {language}.
11. Stay faithful to the source — every claim must be grounded in the provided context.
12. Each slide covers a DIFFERENT aspect of the topic. If two sections seem similar, focus on what makes each one UNIQUE. Never repeat the same example, dataset name, or concept across two slides.
13. For slides sharing the same section title: explicitly label what sub-topic each covers. Slide 1 of a section = theory/definition. Slide 2 = implementation/code/parameters. Slide 3 = limitations/comparison/examples. Never repeat the same sub-topic.
14. A figure reference (e.g. Figure 2-18) must appear in AT MOST ONE slide across the entire presentation. If you already used Figure 2-18 in a previous slide, do not reference it again in any subsequent slide. This is a HARD rule — violating it is not allowed under any circumstances.
15. SUMMARY SLIDE (last slide): Do NOT repeat what was already said in other slides. Instead write 2-3 sentences on the BIG PICTURE — what is the takeaway, what problem does this topic solve, and what should the student remember most. Keep it under 80 words. No technical details, no bullet repetition.

Generate the {num_slides} slides now as valid JSON:"""

        try:
            raw = await self.generate_async(query, [], prompt_override=prompt, use_cache=False)
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