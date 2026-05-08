"""
session_store.py — MongoDB CRUD for live quiz sessions.
"""
import random
import string
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

from modules.core.users_store import get_db

log = logging.getLogger("quiz.session")


def _make_room_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


async def create_session(teacher_id: str, teacher_name: str, questions: list) -> dict:
    """Create a new quiz session. Returns the full session document."""
    db  = get_db()
    # Strip answers from the public-facing questions copy
    public_questions = []
    for q in questions:
        pq = {k: v for k, v in q.items() if k not in ("answer", "explanation")}
        public_questions.append(pq)

    for _ in range(10):  # retry on collision
        code = _make_room_code()
        if not await db.quiz_sessions.find_one({"room_code": code, "status": {"$ne": "closed"}}):
            break

    doc = {
        "session_id":       str(uuid.uuid4()),
        "room_code":        code,
        "teacher_id":       teacher_id,
        "teacher_name":     teacher_name,
        "questions":        questions,          # full (with answers) — teacher only
        "public_questions": public_questions,   # no answers — student facing
        "status":           "waiting",
        "participants":     [],
        "created_at":       datetime.now(timezone.utc),
    }
    await db.quiz_sessions.insert_one(doc)
    log.info(f"Quiz session created: {code} by {teacher_name}")
    return doc


async def get_session_by_code(room_code: str) -> Optional[dict]:
    db = get_db()
    return await db.quiz_sessions.find_one(
        {"room_code": room_code.upper(), "status": {"$ne": "closed"}},
        {"_id": 0},
    )


async def get_session_by_id(session_id: str) -> Optional[dict]:
    db = get_db()
    return await db.quiz_sessions.find_one({"session_id": session_id}, {"_id": 0})


async def set_status(session_id: str, status: str) -> bool:
    db = get_db()
    result = await db.quiz_sessions.update_one(
        {"session_id": session_id},
        {"$set": {"status": status}},
    )
    return result.matched_count > 0


async def add_participant(session_id: str, user_id: str, name: str) -> bool:
    db = get_db()
    existing = await db.quiz_sessions.find_one(
        {"session_id": session_id, "participants.user_id": user_id}
    )
    if existing:
        return True  # already joined
    result = await db.quiz_sessions.update_one(
        {"session_id": session_id},
        {"$push": {"participants": {
            "user_id":   user_id,
            "name":      name,
            "answers":   {},
            "score":     None,
            "joined_at": datetime.now(timezone.utc).isoformat(),
        }}},
    )
    return result.matched_count > 0


async def submit_answers(session_id: str, user_id: str, answers: dict) -> dict:
    """Score the submission and store results. Returns {score, total, correct}."""
    db      = get_db()
    session = await get_session_by_id(session_id)
    if not session:
        return {"score": 0, "total": 0, "correct": 0}

    questions = session.get("questions", [])
    correct   = 0
    for i, q in enumerate(questions):
        key = str(i)
        if answers.get(key, "").strip().lower() == q.get("answer", "").strip().lower():
            correct += 1
    total = len(questions)
    score = round((correct / total) * 100) if total else 0

    await db.quiz_sessions.update_one(
        {"session_id": session_id, "participants.user_id": user_id},
        {"$set": {
            "participants.$.answers":      answers,
            "participants.$.score":        score,
            "participants.$.submitted_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    log.info(f"Session {session_id}: {user_id} scored {score}% ({correct}/{total})")
    return {"score": score, "total": total, "correct": correct}


async def get_leaderboard(session_id: str) -> list:
    """Return sorted participant list for teacher dashboard."""
    session = await get_session_by_id(session_id)
    if not session:
        return []
    parts = [
        {
            "user_id":   p["user_id"],
            "name":      p["name"],
            "score":     p.get("score"),
            "submitted": p.get("score") is not None,
        }
        for p in session.get("participants", [])
    ]
    return sorted(parts, key=lambda x: (x["score"] is None, -(x["score"] or 0)))
