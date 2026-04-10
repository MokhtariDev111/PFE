"""
modules/retrieval — Search & Retrieval Pipeline
================================================
Vector embeddings, hybrid retrieval (FAISS+BM25), query expansion,
context preparation, and RAG evaluation.
"""

from modules.retrieval.embeddings import VectorDB, build_vector_db
from modules.retrieval.retrieval import Retriever, _load_reranker
from modules.retrieval.query_expansion import (
    expand_query_simple, expand_query_llm, deduplicate_results
)
from modules.retrieval.context_manager import (
    prepare_context, prepare_context_for_slides, extract_section_outline
)
from modules.retrieval.evaluation import RAGEvaluator

__all__ = [
    "VectorDB", "build_vector_db",
    "Retriever", "_load_reranker",
    "expand_query_simple", "expand_query_llm", "deduplicate_results",
    "prepare_context", "prepare_context_for_slides", "extract_section_outline",
    "RAGEvaluator",
]
