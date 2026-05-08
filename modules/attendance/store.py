"""
store.py — MongoDB CRUD for attendance sessions.
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

from modules.core.users_store import get_db

log = logging.getLogger("attendance.store")


async def create_session(teacher_id: str, class_id: str, subject: str, local_date: str | None = None) -> dict:
    db  = get_db()
    now = datetime.now(timezone.utc)
    doc = {
        "session_id": str(uuid.uuid4()),
        "teacher_id": teacher_id,
        "class_id":   class_id,
        "subject":    subject,
        "date":       local_date or now.strftime("%Y-%m-%d"),
        "status":     "active",
        "records":    [],
        "created_at": now,
    }
    await db.attendance_sessions.insert_one(doc)
    log.info(f"Attendance session {doc['session_id']} created for {subject}")
    return doc


async def mark_student(session_id: str, name: str, confidence: float) -> bool:
    db = get_db()
    # Avoid duplicate records for the same name in one session
    existing = await db.attendance_sessions.find_one(
        {"session_id": session_id, "records.name": name}
    )
    if existing:
        return True
    result = await db.attendance_sessions.update_one(
        {"session_id": session_id},
        {"$push": {"records": {
            "name":       name,
            "confidence": round(confidence, 1),
            "marked_at":  datetime.now(timezone.utc).isoformat(),
        }}},
    )
    return result.matched_count > 0


async def get_session(session_id: str) -> Optional[dict]:
    db = get_db()
    return await db.attendance_sessions.find_one({"session_id": session_id}, {"_id": 0})


async def close_session(session_id: str, absent_records: list | None = None) -> bool:
    db = get_db()
    update: dict = {"status": "closed", "closed_at": datetime.now(timezone.utc)}
    if absent_records is not None:
        update["absent_records"] = absent_records
    result = await db.attendance_sessions.update_one(
        {"session_id": session_id},
        {"$set": update},
    )
    return result.matched_count > 0


async def list_sessions_by_teacher(teacher_id: str, limit: int = 50) -> list:
    db = get_db()
    cursor = db.attendance_sessions.find(
        {"teacher_id": teacher_id}, {"_id": 0}
    ).sort("created_at", -1).limit(limit)
    return await cursor.to_list(length=limit)


async def list_all_sessions(limit: int = 200) -> list:
    """Admin view — all sessions from all teachers."""
    db = get_db()
    cursor = db.attendance_sessions.find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
    return await cursor.to_list(length=limit)
