"""
modules/core — Shared infrastructure
=====================================
Config, caching, schemas, history, health, retry utilities.
"""

from modules.core.config_loader import CONFIG
from modules.core.llm_cache import get_cached, set_cached, clear_cache, cache_stats
from modules.core.retry_utils import retry_async, RateLimitHandler, RETRYABLE_STATUS_CODES
from modules.core.schemas import (
    SlideSchema, LessonSchema, BulletPoint,
    validate_slide, validate_and_fix_slide,
)
from modules.core.history_store import record_presentation, load_history, clear_history
from modules.core.health import full_health_check, quick_status

__all__ = [
    "CONFIG",
    "get_cached", "set_cached", "clear_cache", "cache_stats",
    "retry_async", "RateLimitHandler", "RETRYABLE_STATUS_CODES",
    "SlideSchema", "LessonSchema", "BulletPoint",
    "validate_slide", "validate_and_fix_slide",
    "record_presentation", "load_history", "clear_history",
    "full_health_check", "quick_status",
]
