"""
users_store.py — User CRUD using async motor (MongoDB)
"""
import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient

log = logging.getLogger("users")

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
DB_NAME   = "pfe"

def _admin_email() -> str:
    """Read ADMIN_EMAIL at call time so .env is always loaded first."""
    return os.getenv("ADMIN_EMAIL", "").lower().strip()

_client: Optional[AsyncIOMotorClient] = None


def get_db():
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(MONGO_URI, serverSelectionTimeoutMS=3000)
    return _client[DB_NAME]


async def ensure_indexes():
    db = get_db()
    await db.users.create_index("email", unique=True)
    await db.conversations.create_index([("user_id", 1), ("updated_at", -1)])
    await db.contacts.create_index("created_at")
    # Promote ADMIN_EMAIL user to admin if not already
    admin_email = _admin_email()
    if admin_email:
        await db.users.update_one(
            {"email": admin_email, "is_admin": {"$ne": True}},
            {"$set": {"is_admin": True}},
        )


async def create_user(
    name: str,
    email: str,
    password_hash: str,
    auth_provider: str = "email",
) -> dict:
    db  = get_db()
    now = datetime.now(timezone.utc)
    email = email.lower().strip()
    doc = {
        "user_id":       str(uuid.uuid4()),
        "name":          name,
        "email":         email,
        "password_hash": password_hash,
        "auth_provider": auth_provider,
        "is_admin":      email == _admin_email(),
        "created_at":    now,
    }
    await db.users.insert_one(doc)
    log.info(f"User created: {email}")
    return doc


async def create_or_get_google_user(email: str, name: str, avatar_url: str = "") -> dict:
    """Find existing user by email or create a new Google-auth user."""
    db = get_db()
    email = email.lower().strip()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        # Update avatar from Google if user doesn't have one yet
        if avatar_url and not existing.get("avatar_url"):
            await db.users.update_one(
                {"email": email},
                {"$set": {"avatar_url": avatar_url}},
            )
            existing["avatar_url"] = avatar_url
        return existing
    user = await create_user(name, email, password_hash="", auth_provider="google")
    if avatar_url:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"avatar_url": avatar_url}})
        user["avatar_url"] = avatar_url
    return user


async def update_profile(user_id: str, name: str = "", avatar_url: str = "") -> Optional[dict]:
    """Update name and/or avatar. Returns the updated user document."""
    db  = get_db()
    upd: dict = {}
    if name:
        upd["name"] = name.strip()
    if avatar_url:
        upd["avatar_url"] = avatar_url
    if not upd:
        return await get_user_by_id(user_id)
    await db.users.update_one({"user_id": user_id}, {"$set": upd})
    return await get_user_by_id(user_id)


async def get_user_by_email(email: str) -> Optional[dict]:
    db = get_db()
    return await db.users.find_one({"email": email.lower().strip()}, {"_id": 0})


async def get_user_by_id(user_id: str) -> Optional[dict]:
    db = get_db()
    return await db.users.find_one({"user_id": user_id}, {"_id": 0})


async def delete_user(user_id: str) -> bool:
    db = get_db()
    result = await db.users.delete_one({"user_id": user_id})
    return result.deleted_count > 0


async def ban_user(user_id: str, reason: str = "") -> bool:
    db  = get_db()
    now = datetime.now(timezone.utc)
    result = await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"is_banned": True, "ban_reason": reason, "banned_at": now}},
    )
    return result.matched_count > 0


async def unban_user(user_id: str) -> bool:
    db = get_db()
    result = await db.users.update_one(
        {"user_id": user_id},
        {"$unset": {"is_banned": "", "ban_reason": "", "banned_at": ""}},
    )
    return result.matched_count > 0


async def save_contact_reply(contact_id: str, reply_text: str) -> bool:
    db  = get_db()
    now = datetime.now(timezone.utc)
    result = await db.contacts.update_one(
        {"contact_id": contact_id},
        {"$set": {"replied": True, "reply_text": reply_text.strip(), "replied_at": now}},
    )
    return result.matched_count > 0


# ── Admin queries ─────────────────────────────────────────────────────────────

async def list_users(limit: int = 200) -> list[dict]:
    db = get_db()
    pipeline = [
        {"$match": {}},
        {"$lookup": {
            "from": "conversations",
            "let": {"uid": "$user_id"},
            "pipeline": [
                {"$match": {"$expr": {"$eq": ["$user_id", "$$uid"]}}},
                {"$count": "n"},
            ],
            "as": "conv_info",
        }},
        {"$addFields": {
            "conversation_count": {
                "$ifNull": [{"$arrayElemAt": ["$conv_info.n", 0]}, 0]
            }
        }},
        {"$project": {
            "_id": 0,
            "password_hash": 0,
            "conv_info": 0,
        }},
        {"$sort": {"created_at": -1}},
        {"$limit": limit},
    ]
    docs = await db.users.aggregate(pipeline).to_list(length=limit)
    return docs


async def get_admin_stats() -> dict:
    db  = get_db()
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start  = today_start - timedelta(days=7)

    total_users        = await db.users.count_documents({})
    new_today_users    = await db.users.count_documents({"created_at": {"$gte": today_start}})
    new_week_users     = await db.users.count_documents({"created_at": {"$gte": week_start}})
    banned_users       = await db.users.count_documents({"is_banned": True})
    total_contacts     = await db.contacts.count_documents({})
    new_today_contacts = await db.contacts.count_documents({"created_at": {"$gte": today_start}})
    unreplied_contacts = await db.contacts.count_documents({"replied": {"$ne": True}})

    # Conversations grouped by mode
    conv_pipeline = [
        {"$group": {"_id": "$mode", "count": {"$sum": 1}}},
    ]
    conv_by_mode_raw = await db.conversations.aggregate(conv_pipeline).to_list(length=20)
    conv_by_mode = {doc["_id"]: doc["count"] for doc in conv_by_mode_raw if doc["_id"]}
    total_conversations = sum(conv_by_mode.values())

    return {
        "users": {
            "total":    total_users,
            "active":   total_users - banned_users,
            "banned":   banned_users,
            "new_today": new_today_users,
            "new_week":  new_week_users,
        },
        "conversations": {
            "total":   total_conversations,
            "by_mode": conv_by_mode,
        },
        "contacts": {
            "total":     total_contacts,
            "unreplied": unreplied_contacts,
            "new_today": new_today_contacts,
        },
    }


# ── Contact messages ──────────────────────────────────────────────────────────

async def save_contact(name: str, email: str, message: str) -> dict:
    db  = get_db()
    now = datetime.now(timezone.utc)
    doc = {
        "contact_id": str(uuid.uuid4()),
        "name":       name,
        "email":      email.lower().strip(),
        "message":    message,
        "created_at": now,
    }
    await db.contacts.insert_one(doc)
    return doc


async def list_contacts(limit: int = 100) -> list[dict]:
    db = get_db()
    cursor = db.contacts.find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
    return await cursor.to_list(length=limit)
