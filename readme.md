

## 🎓 Complete Project Structure & Architecture Guide

Your project is a **RAG-powered AI Teaching Assistant** that generates educational presentations from PDF documents. Here's the complete breakdown in execution order:

---

## **PIPELINE OVERVIEW** (The Full Data Flow)

```
INPUT (PDFs/Images)
        ↓
[1] INGESTION → [2] OCR → [3] TEXT PROCESSING → [4] EMBEDDINGS
        ↓
[5] VECTOR DB (FAISS + BM25) → [6] RETRIEVAL (Hybrid Search + Reranking)
        ↓
[7] LLM GENERATION (Batch or Sequential) → [8] PEDAGOGICAL ENGINE
        ↓
[9] CONTEXT MANAGEMENT → [10] SLIDE GENERATION
        ↓
[11] DIAGRAMS + HTML RENDERING → [12] OUTPUT (Presentation)
```

---

## **FILE-BY-FILE BREAKDOWN**

### **1️⃣ CONFIG & ENTRY POINTS**

```
config.yaml
├─ Project metadata
├─ Path configurations
├─ Model settings (embeddings, LLM backends)
├─ Retrieval settings (BM25 weight, reranker)
└─ Generation parameters (quality threshold, parallel mode)

api.py (FastAPI Server)
├─ Main HTTP endpoints
├─ Streaming response handler (/generate-stream)
├─ Session management
├─ Cache management
└─ Multi-backend support (Groq + Ollama)

requirements.txt
└─ All Python dependencies (FastAPI, PyMuPDF, Faiss, Ollama, etc.)
```

---

### **2️⃣ DATA INGESTION LAYER**

```
modules/ingestion.py — Step 1: Load Documents
├─ load_pdf()
│  ├─ Extracts text from PDFs (PyMuPDF)
│  ├─ Detects large diagrams (full-page images)
│  ├─ Extracts embedded images from PDFs
│  └─ Skips cover pages automatically (heuristic: first 8% of pages)
│
├─ load_image()
│  ├─ Converts images to Base64
│  └─ Filters by size (>150x150px)
│
├─ load_txt()
│  └─ Plain text file support
│
└─ ingest_directory()
   └─ Orchestrates all file loading
```

**Key Concept**: DocumentPage objects with metadata (source, page, type)

---

### **3️⃣ OCR & TEXT PROCESSING**

```
modules/ocr.py — Step 2: Extract Text from Images
├─ run_ocr() — EasyOCR engine
├─ warm_ocr_engine() — Pre-load GPU
└─ Supports: French + English

modules/text_processing.py — Step 3: Chunk Text
├─ process_pages()
│  ├─ Creates chunks with overlap
│  ├─ Chunk size: 512 tokens
│  ├─ Overlap: 64 tokens (for continuity)
│  └─ Returns TextChunk objects with source metadata
└─ Converts DocumentPage → TextChunk
```

**Key**: Chunks are the units that get embedded

---

### **4️⃣ EMBEDDINGS & VECTOR DB**

```
modules/embeddings.py — Step 4: Create Dense Vectors
├─ VectorDB class
│  ├─ _load_model() — Sentence Transformers (BAAI/bge-base-en-v1.5)
│  ├─ embed_and_store()
│  │  ├─ Encodes chunks to 768-dim vectors
│  │  ├─ Normalizes with L2
│  │  ├─ Semantic deduplication (removes 95%+ similar chunks)
│  │  └─ Saves to FAISS index
│  └─ _save_to_disk()
│     ├─ FAISS binary index (.index)
│     ├─ Chunk metadata as JSON
│     └─ **BM25 tokenized corpus** (.bm25.json) ← For hybrid search
│
└─ build_vector_db() — Main entry point
```

**Key**: FAISS for fast semantic similarity search

---

### **5️⃣ RETRIEVAL (The RAG Core)**

```
modules/retrieval.py — Step 5: Hybrid Search + Reranking
├─ Retriever class
│  ├─ _load_db()
│  │  ├─ Loads FAISS index
│  │  ├─ Loads BM25 corpus
│  │  └─ Loads chunk metadata
│  │
│  ├─ _dense_search() — FAISS (Semantic)
│  │  └─ Cosine similarity on embeddings
│  │
│  ├─ _sparse_search() — BM25 (Keyword)
│  │  └─ Term frequency ranking
│  │
│  ├─ _rrf_merge() — Reciprocal Rank Fusion
│  │  └─ Merges dense + sparse results
│  │     (Combines strengths: "transformer architecture" + exact "transformer")
│  │
│  ├─ _rerank() — Cross-encoder Reranker
│  │  └─ BAAI/bge-reranker-base rescores top-N
│  │     (Better accuracy, slower)
│  │
│  └─ search() — Full Pipeline
│     ├─ Dense search → BM25 search → RRF merge
│     ├─ Rerank top-N → Return top-k
│     └─ Graceful fallback if components unavailable
│
└─ search_expanded() — Multi-Query Retrieval
   ├─ Expands query (e.g., "ML" → ["machine learning", "ML", "deep learning"])
   ├─ Searches each variant
   └─ Returns +30-40% more relevant docs
```

**Key Concepts**:
- **BM25**: Keyword-based ranking (catches exact matches)
- **FAISS**: Dense vector search (semantic similarity)
- **RRF**: Combines both ranked lists intelligently
- **Cross-encoder**: Re-scores for accuracy (BAAI/bge-reranker-base)

---

### **6️⃣ QUERY OPTIMIZATION**

```
modules/query_expansion.py
├─ expand_query_simple()
│  └─ Creates query variations (synonyms, subtopics)
│
└─ deduplicate_results()
   └─ Removes near-duplicate chunks
```

---

### **7️⃣ LLM BACKEND (Multi-Provider)**

```
modules/llm.py — Step 6: LLM Generation
├─ LLMEngine class (Auto-selects backend)
│  ├─ GROQ Backend (Primary - 10-20x faster)
│  │  ├─ API: api.groq.com/openai/v1/chat/completions
│  │  ├─ Models: llama-3.3-70b, mixtral-8x7b
│  │  ├─ Rate limit handling
│  │  └─ Automatic retry + fallback
│  │
│  ├─ OLLAMA Backend (Fallback - Local)
│  │  ├─ API: http://localhost:11434/api/generate
│  │  ├─ Model: llama3.2 (or custom)
│  │  └─ CUDA error recovery
│  │
│  ├─ generate_async()
│  │  └─ Single LLM call with caching
│  │
│  └─ generate_all_slides_batch() ⭐ OPTIMIZATION
│     ├─ Generates ALL N slides in ONE LLM call
│     ├─ Returns list[dict] with slide JSON
│     ├─ Much faster than sequential (1 call vs N)
│     └─ Includes image hints in prompt
│
└─ judge_async() — Optional Quality Check
   └─ Second LLM call to score slide quality
```

**Key**: 
- Uses **caching** to avoid re-generating same queries
- **Batch mode** reduces latency from N×latency → 1×latency
- **Fallback**: Groq fails → falls back to Ollama

---

### **8️⃣ PEDAGOGICAL ENGINE (Teaching Logic)**

```
modules/pedagogical_engine.py — Step 7: Slide Generation
├─ PedagogicalEngine class
│  ├─ SLIDE_ARC = ["intro", "definition", "concept", "example", ...]
│  │  └─ Defines logical teaching sequence
│  │
│  ├─ _generate_one_slide() — Generates single slide with:
│  │  ├─ Per-slide sub-query retrieval (targeted context)
│  │  ├─ Quality gate (self-reported quality_score)
│  │  ├─ LLM-as-judge (optional second quality check)
│  │  ├─ Fingerprinting deduplication (content similarity)
│  │  └─ Up to 3 retry attempts on failure
│  │
│  ├─ _generate_sequential()
│  │  └─ One slide at a time (aware of previous slides)
│  │
│  ├─ _generate_parallel() ⭐ OPTIMIZATION
│  │  ├─ Launches all N coroutines with asyncio.gather()
│  │  └─ Post-gather deduplication (catches repeats)
│  │
│  └─ generate_lesson_async()
│     └─ Main entry point (routes to sequential or parallel)
│
├─ _build_slide_prompt()
│  ├─ Instructs LLM on slide type, language
│  ├─ Warns about previous slides (avoid repeats)
│  ├─ Suggests visual hint (flowchart, timeline, etc.)
│  └─ Includes available images + contexts
│
└─ _slide_fingerprint()
   └─ SHA-1 hash of title + first 3 bullets
      (detects duplicates even with slight rewording)
```

**Key Concepts**:
- **Quality Score**: Self-reported by LLM (1-10)
- **Quality Feedback**: LLM explains why rejected
- **Visual Hint**: Diagram suggestion (flowchart, mindmap, etc.)
- **Image Assignment**: LLM chooses from available images
- **Pedagogical Arc**: Structured teaching sequence

---

### **9️⃣ CONTEXT MANAGEMENT**

```
modules/context_manager.py — Step 8: Prepare Context for Slides
├─ prepare_context()
│  ├─ Relevance-based prioritization (already sorted by retriever)
│  ├─ Sentence-boundary-aware truncation (no mid-sentence cuts)
│  ├─ Token budget optimization (≈4 chars per token)
│  ├─ Optional deduplication (removes repeated sentences)
│  └─ Metadata inclusion (source, page info)
│
└─ prepare_context_for_slides()
   ├─ Scales context budget by num_slides
   ├─ 5 slides → 3500 tokens max context
   └─ Prevents token limit overflow
```

---

### **🔟 SLIDE DATA & VALIDATION**

```
modules/schemas.py — Data Structures
├─ SlideData dataclass (in slide_generator.py)
│  ├─ title: str
│  ├─ bullets: list[dict] with "text" + "source_id"
│  ├─ speaker_notes: str
│  ├─ slide_type: str (intro, concept, etc.)
│  ├─ visual_hint: str (flowchart, mindmap, etc.)
│  ├─ image_id: str | null (IMG_001, etc.)
│  └─ quality_score: int (1-10)
│
└─ validate_and_fix_slide()
   └─ Pydantic validation + auto-repair
```

---

### **1️⃣1️⃣ DIAGRAM & HTML RENDERING**

```
modules/diagram_generator.py
├─ generate_all_diagrams()
│  ├─ Creates SVG diagrams based on visual_hint
│  ├─ Types: flowchart, mindmap, timeline, etc.
│  └─ Color-coded (#1F6FEB = primary blue)
│
modules/html_renderer.py
├─ render()
│  ├─ Converts slides to HTML presentation
│  ├─ Theme support (Dark Navy, etc.)
│  ├─ Embeds images (Base64)
│  ├─ Includes captions + metadata
│  └─ Returns path to .html file
```

---

### **1️⃣2️⃣ UTILITIES & HELPERS**

```
modules/config_loader.py — YAML Config Parser
modules/llm_cache.py — LLM Response Caching
modules/history_store.py — Presentation History
modules/retry_utils.py — Async Retry Logic + Rate Limiting
modules/health.py — System Health Checks
modules/evaluation.py — RAG Quality Metrics
```

---

## **INTERVIEW TALKING POINTS**

### **1. LLM Used**
- **Primary**: Groq (llama-3.3-70b-versatile) — 10-20x faster inference
- **Fallback**: Ollama local (llama3.2) — for offline/backup
- **Why**: Cost-effective + reliable fallback

### **2. RAG Method (Advanced Hybrid)**
```
┌─────────────────────────────────────────────────┐
│         HYBRID RETRIEVAL PIPELINE                │
├─────────────────────────────────────────────────┤
│ 1. DENSE SEARCH (FAISS)                         │
│    └─ Semantic similarity using embeddings      │
│       Model: BAAI/bge-base-en-v1.5 (768-dim)  │
│                                                 │
│ 2. SPARSE SEARCH (BM25)                         │
│    └─ Keyword-based ranking                    │
│       Benefits: Catches exact matches           │
│                                                 │
│ 3. RECIPROCAL RANK FUSION (RRF)                │
│    └─ Intelligent merge of both lists          │
│       Formula: 1/(k+rank_dense) + 1/(k+rank_sparse)│
│                                                 │
│ 4. CROSS-ENCODER RERANKING                      │
│    └─ Final rescoring with BAAI/bge-reranker   │
│       Benefits: More accurate relevance         │
│                                                 │
│ 5. MULTI-QUERY EXPANSION                        │
│    └─ Query variants for +30-40% recall        │
└─────────────────────────────────────────────────┘
```

### **3. Pedagogical Approach**
- **Slide Arc**: Logical teaching sequence (intro → concept → example → summary)
- **Quality Gates**: 
  - Self-reported quality_score (LLM-as-judge disabled by default for speed)
  - Fingerprint deduplication
  - Per-slide context retrieval
- **Visual Hints**: Diagram suggestions (flowchart, mindmap, timeline, etc.)
- **Image Integration**: Auto-selects relevant embedded images

### **4. Optimizations**
| Optimization | Impact | How |
|---|---|---|
| **Batch Generation** | 5x faster | Generate all slides in 1 LLM call |
| **Hybrid Retrieval** | +30-40% recall | Combine FAISS + BM25 |
| **Caching** | Avoid re-generation | Cache LLM responses by prompt hash |
| **Multi-Query** | Better coverage | Query expansion (synonyms, subtopics) |
| **Parallel Generation** | ~1x latency | Async asyncio.gather() for all slides |
| **Semantic Dedup** | -30% redundant chunks | Remove 95%+ similar embeddings |

### **5. Tech Stack**
```
Backend:        FastAPI (Python)
Vector DB:      FAISS (dense) + BM25 (sparse)
Embeddings:     Sentence Transformers (BAAI)
LLM:            Groq (primary) + Ollama (fallback)
OCR:            EasyOCR
PDF Processing: PyMuPDF (fitz)
Rendering:      Python-pptx, HTML/CSS
Frontend:       (You mentioned ignoring this)
```

---

## **EXECUTION FLOW (User POV)**

1. **Upload PDF** → API receives file
2. **Hash check** → Skip if same file uploaded before (cache hit)
3. **Ingest** → Extract text + images from PDFs
4. **OCR** → Run OCR on embedded images
5. **Chunk** → Split into 512-token chunks with 64-token overlap
6. **Embed** → Create FAISS index + BM25 corpus
7. **Query** → User provides topic/prompt
8. **Retrieve** → Hybrid search (FAISS + BM25 + reranking)
9. **Expand context** → Scale by num_slides
10. **Generate slides** → Batch mode (all at once) or sequential
11. **Validate** → Quality gates + deduplication
12. **Diagrams** → Generate SVG visualizations
13. **Render** → Convert to HTML presentation
14. **Return** → Stream response + store session

---

## **KEY FILES TO STUDY NEXT**

For your interview, focus on understanding:
1. **retrieval.py** — Hybrid search (BM25 + FAISS + RRF + reranking)
2. **llm.py** — Multi-backend + batch generation
3. **pedagogical_engine.py** — Quality gates + teaching sequence
4. **api.py** — The orchestration (how it all connects)

Good luck with your interview! 🚀