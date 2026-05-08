"""
timetable_store.py — CRUD for the timetable MongoDB collection.
Each entry represents one class slot: teacher, subject, day, time.
"""
import csv
import io
import uuid
import logging
from typing import Optional

from modules.core.users_store import get_db

log = logging.getLogger("timetable")

DAYS = {"Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"}


async def list_timetable() -> list[dict]:
    db = get_db()
    cursor = db.timetable.find({}, {"_id": 0}).sort("day", 1)
    return await cursor.to_list(length=500)


async def get_class(class_id: str) -> Optional[dict]:
    db = get_db()
    return await db.timetable.find_one({"class_id": class_id}, {"_id": 0})


async def upsert_class(
    teacher_name: str,
    teacher_email: str,
    subject: str,
    day: str,
    start_time: str,
    end_time: str,
    classroom: str = "",
    year: str = "",
    class_id: Optional[str] = None,
) -> dict:
    db  = get_db()
    doc = {
        "class_id":      class_id or str(uuid.uuid4()),
        "teacher_name":  teacher_name.strip(),
        "teacher_email": teacher_email.lower().strip(),
        "subject":       subject.strip(),
        "day":           day.strip(),
        "start_time":    start_time.strip(),
        "end_time":      end_time.strip(),
        "classroom":     classroom.strip(),
        "year":          year.strip(),
    }
    await db.timetable.update_one(
        {"class_id": doc["class_id"]},
        {"$set": doc, "$setOnInsert": {"enrolled_students": []}},
        upsert=True,
    )
    # Promote any registered user with this email to teacher role
    await db.users.update_many(
        {"email": doc["teacher_email"], "role": "student"},
        {"$set": {"role": "teacher"}},
    )
    log.info(f"Timetable upsert: {doc['subject']} — {doc['teacher_email']}")
    return doc


async def enroll_student(class_id: str, user_id: str, name: str, email: str) -> bool:
    db = get_db()
    existing = await db.timetable.find_one(
        {"class_id": class_id, "enrolled_students.user_id": user_id}
    )
    if existing:
        return True
    result = await db.timetable.update_one(
        {"class_id": class_id},
        {"$push": {"enrolled_students": {"user_id": user_id, "name": name, "email": email}}},
    )
    return result.matched_count > 0


async def unenroll_student(class_id: str, user_id: str) -> bool:
    db = get_db()
    result = await db.timetable.update_one(
        {"class_id": class_id},
        {"$pull": {"enrolled_students": {"user_id": user_id}}},
    )
    return result.matched_count > 0


async def get_enrolled_students(class_id: str) -> list:
    db  = get_db()
    doc = await db.timetable.find_one({"class_id": class_id}, {"_id": 0, "enrolled_students": 1})
    return doc.get("enrolled_students", []) if doc else []


async def get_student_classes(student_email: str) -> list:
    db = get_db()
    cursor = db.timetable.find(
        {"enrolled_students.email": student_email.lower()}, {"_id": 0}
    )
    return await cursor.to_list(length=100)


async def delete_class(class_id: str) -> bool:
    db = get_db()
    result = await db.timetable.delete_one({"class_id": class_id})
    return result.deleted_count > 0


async def import_csv(csv_text: str) -> dict:
    """Parse a CSV string and upsert all rows. Returns counts."""
    reader  = csv.DictReader(io.StringIO(csv_text))
    created = 0
    errors  = []
    required = {"teacher_name", "teacher_email", "subject", "day", "start_time", "end_time"}

    for i, row in enumerate(reader, start=2):
        # Normalize header keys (strip whitespace, lowercase)
        row = {k.strip().lower(): v.strip() for k, v in row.items()}
        missing = required - set(row.keys())
        if missing:
            errors.append(f"Row {i}: missing columns {missing}")
            continue
        if not row.get("teacher_email") or "@" not in row["teacher_email"]:
            errors.append(f"Row {i}: invalid email '{row.get('teacher_email')}'")
            continue
        try:
            await upsert_class(
                teacher_name=row["teacher_name"],
                teacher_email=row["teacher_email"],
                subject=row["subject"],
                day=row["day"],
                start_time=row["start_time"],
                end_time=row["end_time"],
                classroom=row.get("classroom", ""),
                year=row.get("year", ""),
            )
            created += 1
        except Exception as e:
            errors.append(f"Row {i}: {e}")

    return {"created": created, "errors": errors}
