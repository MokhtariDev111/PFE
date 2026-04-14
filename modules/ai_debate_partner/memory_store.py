"""
memory_store.py — MongoDB persistent memory for the AI Debate Partner
======================================================================
Stores and retrieves:
  - Conversation history (messages per conversation)
  - User profile: learning goals, weak topics, exam dates, study preferences

Database : pfe
Collection: conversation_history

Document structure:
{
  "_id": ObjectId,
  "conversation_id": str,       # unique ID per conversation
  "title": str,                 # auto-generated from first message
  "mode": str,                  # last used mode
  "messages": [
    {"role": "user"|"assistant", "content": str, "timestamp": datetime}
  ],
  "created_at": datetime,
  "updated_at": datetime,
}

User profile is stored as a special document with conversation_id = "__profile__"
"""

import logging
from datetime import datetime, timezone
from typing import Optional

log = logging.getLogger("debate.memory")

MONGO_URI   = "mongodb://localhost:27017/"
DB_NAME     = "pfe"
COLLECTION  = "conversation_history"
PROFILE_ID  = "__profile__"


_mongo_client = None


def _get_collection():
    global _mongo_client
    if _mongo_client is None:
        from pymongo import MongoClient
        _mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
    return _mongo_client[DB_NAME][COLLECTION]


class MemoryStore:
    """
    Handles all MongoDB read/write for the debate partner.

    Usage:
        store = MemoryStore()

        # Save a message
        store.append_message(conversation_id, role="user", content="...")

        # Load full history
        history = store.get_history(conversation_id)

        # List all conversations
        convos = store.list_conversations()

        # Update user profile
        store.update_profile({"weak_topics": ["overfitting", "backprop"]})
    """

    # ── Conversations ─────────────────────────────────────────────────────────

    def create_conversation(self, conversation_id: str, mode: str = "auto", title: str = "") -> dict:
        """Create a new conversation document."""
        col = _get_collection()
        now = datetime.now(timezone.utc)
        doc = {
            "conversation_id": conversation_id,
            "title": title or "New conversation",
            "mode": mode,
            "messages": [],
            "created_at": now,
            "updated_at": now,
        }
        col.insert_one(doc)
        log.info(f"Created conversation: {conversation_id}")
        return doc

    def get_conversation(self, conversation_id: str) -> Optional[dict]:
        """Get a conversation document by ID."""
        col = _get_collection()
        return col.find_one({"conversation_id": conversation_id}, {"_id": 0})

    def append_message(self, conversation_id: str, role: str, content: str, mode: str = "auto"):
        """
        Append a message to a conversation.
        Creates the conversation if it doesn't exist.
        Auto-generates title from first user message.
        """
        col = _get_collection()
        now = datetime.now(timezone.utc)
        msg = {"role": role, "content": content, "timestamp": now}

        existing = col.find_one({"conversation_id": conversation_id})
        if not existing:
            title = content[:60] + ("…" if len(content) > 60 else "")
            self.create_conversation(conversation_id, mode=mode, title=title)

        col.update_one(
            {"conversation_id": conversation_id},
            {
                "$push": {"messages": msg},
                "$set": {"updated_at": now, "mode": mode},
            }
        )

    def set_document(self, conversation_id: str, filename: str, chunk_count: int):
        """Record that a document has been indexed for this conversation."""
        col = _get_collection()
        col.update_one(
            {"conversation_id": conversation_id},
            {"$set": {
                "document": {"filename": filename, "chunks": chunk_count},
                "updated_at": datetime.now(timezone.utc),
            }},
            upsert=True,
        )
        log.info(f"Document '{filename}' ({chunk_count} chunks) linked to '{conversation_id}'")

    def get_history(self, conversation_id: str) -> list[dict]:
        """Return messages list for a conversation (role + content only)."""
        doc = self.get_conversation(conversation_id)
        if not doc:
            return []
        return [{"role": m["role"], "content": m["content"]} for m in doc.get("messages", [])]

    def list_conversations(self, limit: int = 30) -> list[dict]:
        """List recent conversations (newest first), excluding the profile doc."""
        col = _get_collection()
        cursor = col.find(
            {"conversation_id": {"$ne": PROFILE_ID}},
            {"_id": 0, "conversation_id": 1, "title": 1, "mode": 1, "updated_at": 1, "created_at": 1}
        ).sort("updated_at", -1).limit(limit)
        return list(cursor)

    def delete_conversation(self, conversation_id: str):
        """Delete a conversation and its RAG index."""
        col = _get_collection()
        col.delete_one({"conversation_id": conversation_id})
        # Also clean up the isolated RAG index
        try:
            from modules.ai_debate_partner.rag_retriever import delete_index
            delete_index(conversation_id)
        except Exception:
            pass
        log.info(f"Deleted conversation: {conversation_id}")

    # ── User profile ──────────────────────────────────────────────────────────

    def get_profile(self) -> dict:
        """Get the shared user profile."""
        col = _get_collection()
        doc = col.find_one({"conversation_id": PROFILE_ID}, {"_id": 0})
        if not doc:
            return {"conversation_id": PROFILE_ID, "goals": [], "weak_topics": [], "exam_dates": [], "preferences": {}}
        return doc

    def update_profile(self, updates: dict):
        """Merge updates into the user profile."""
        col = _get_collection()
        updates["updated_at"] = datetime.now(timezone.utc)
        col.update_one(
            {"conversation_id": PROFILE_ID},
            {"$set": updates},
            upsert=True,
        )
        log.info(f"Profile updated: {list(updates.keys())}")

    def build_memory_context(self) -> str:
        """
        Build a short text summary of the user profile to inject into the system prompt.
        Returns empty string if no meaningful profile exists.
        """
        profile = self.get_profile()
        parts = []

        if profile.get("goals"):
            parts.append(f"Learning goals: {', '.join(profile['goals'])}")
        if profile.get("weak_topics"):
            parts.append(f"Weak topics (focus more on these): {', '.join(profile['weak_topics'])}")
        if profile.get("exam_dates"):
            parts.append(f"Upcoming exams: {', '.join(profile['exam_dates'])}")
        if profile.get("preferences"):
            prefs = profile["preferences"]
            if prefs.get("study_hours"):
                parts.append(f"Available study hours per day: {prefs['study_hours']}")

        return "\n".join(parts) if parts else ""
