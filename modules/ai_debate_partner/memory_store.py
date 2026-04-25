"""
memory_store.py — MongoDB persistent memory (motor async client)
"""

import logging
import os
from datetime import datetime, timezone
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient

log = logging.getLogger("debate.memory")

MONGO_URI  = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
DB_NAME    = "pfe"
COLLECTION = "conversations"
PROFILE_ID = "__profile__"

_client: Optional[AsyncIOMotorClient] = None


def _get_col():
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(MONGO_URI, serverSelectionTimeoutMS=3000)
    return _client[DB_NAME][COLLECTION]


class MemoryStore:

    # ── Conversations ─────────────────────────────────────────────────────────

    async def append_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        mode: str = "auto",
        user_id: str = "anonymous",
    ):
        col = _get_col()
        now = datetime.now(timezone.utc)
        msg = {"role": role, "content": content, "timestamp": now}

        existing = await col.find_one({"conversation_id": conversation_id})
        if not existing:
            title = content[:60] + ("…" if len(content) > 60 else "")
            await col.insert_one({
                "conversation_id": conversation_id,
                "user_id":         user_id,
                "title":           title,
                "mode":            mode,
                "messages":        [],
                "created_at":      now,
                "updated_at":      now,
            })

        await col.update_one(
            {"conversation_id": conversation_id},
            {
                "$push": {"messages": msg},
                "$set":  {"updated_at": now, "mode": mode},
            },
        )

    async def get_history(self, conversation_id: str) -> list[dict]:
        col = _get_col()
        doc = await col.find_one({"conversation_id": conversation_id}, {"_id": 0})
        if not doc:
            return []
        return [{"role": m["role"], "content": m["content"]} for m in doc.get("messages", [])]

    async def list_conversations(self, user_id: str = "anonymous", limit: int = 30) -> list[dict]:
        col = _get_col()
        cursor = col.find(
            {"user_id": user_id, "conversation_id": {"$ne": PROFILE_ID}},
            {"_id": 0, "conversation_id": 1, "title": 1, "mode": 1, "updated_at": 1},
        ).sort("updated_at", -1).limit(limit)
        return await cursor.to_list(length=limit)

    async def delete_conversation(self, conversation_id: str):
        col = _get_col()
        await col.delete_one({"conversation_id": conversation_id})
        try:
            from modules.ai_debate_partner.rag_retriever import delete_index
            delete_index(conversation_id)
        except Exception:
            pass

    async def delete_all_conversations(self, user_id: str):
        col = _get_col()
        docs = await col.find(
            {"user_id": user_id, "conversation_id": {"$ne": PROFILE_ID}},
            {"conversation_id": 1},
        ).to_list(length=1000)
        for doc in docs:
            try:
                from modules.ai_debate_partner.rag_retriever import delete_index
                delete_index(doc["conversation_id"])
            except Exception:
                pass
        await col.delete_many({"user_id": user_id, "conversation_id": {"$ne": PROFILE_ID}})

    async def set_document(self, conversation_id: str, filename: str, chunk_count: int):
        col = _get_col()
        await col.update_one(
            {"conversation_id": conversation_id},
            {"$set": {
                "document":   {"filename": filename, "chunks": chunk_count},
                "updated_at": datetime.now(timezone.utc),
            }},
            upsert=True,
        )

    # ── Profile (per-user) ────────────────────────────────────────────────────

    def build_memory_context(self) -> str:
        return ""
