"""Explicit, atomic development seed; never invoked by application startup."""
import argparse
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from uuid import NAMESPACE_URL, uuid5
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import Settings
from app.core.exceptions import DomainError
from app.db.session import build_engine, session_factory
from app.models import Availability, StudySession, Subject, Task
from app.models.enums import StudySessionStatus
from app.schemas.task import TaskCreate
from app.services.common import serialize_write
from app.services.tasks import task_values
from app.services.time_rules import interval, local_instant


def identifier(name: str):
    return uuid5(NAMESPACE_URL, "ai-study-planner/demo/" + name)


def seed_into(db, timezone: str, base_date: date | None = None) -> dict:
    serialize_write(db)
    if any(db.scalar(select(func.count()).select_from(model)) for model in (Subject, Task, Availability, StudySession)):
        raise DomainError("Seed requires empty core tables. No existing records were changed.", 409)
    today = datetime.now(ZoneInfo(timezone)).date()
    base = base_date or today + timedelta(days=(7 - today.weekday()) % 7 or 7)
    if base <= today or base.weekday() != 0:
        raise DomainError("Seed base date must be a future Monday.")
    subjects = [
        ("databases", "Databases", "Data modeling, SQL, and relational systems.", "gold"),
        ("management", "Project Management", "Planning, delivery, and project lifecycles.", "purple"),
        ("statistics", "Statistics", "Probability, inference, and data analysis.", "green"),
        ("thesis", "Diploma Thesis", "Research, literature review, and writing.", "blue"),
    ]
    for key, name, description, color in subjects:
        db.add(Subject(id=identifier("subject/" + key), name=name, description=description, color=color))
    db.flush()
    definitions = [
        ("db-assignment", "Finish Databases assignment", "databases", 2, 5, "1", "HIGH", "HARD"),
        ("db-project", "Database Final Project", "databases", 6, 3, "1.2", "MEDIUM", "MEDIUM"),
        ("pm-report", "Project Management Report", "management", 3, 5, "3", "HIGH", "MEDIUM"),
        ("pm-notes", "Review Project Management notes", "management", 5, 3, "0.8", "MEDIUM", "MEDIUM"),
        ("stats-problems", "Statistics problem set", "statistics", 7, 5, "2", "MEDIUM", "MEDIUM"),
        ("stats-review", "Review probability notes", "statistics", 9, 3, "0.9", "LOW", "EASY"),
        ("thesis-papers", "Read research papers", "thesis", 14, 5, "3", "MEDIUM", "HARD"),
        ("thesis-report", "Organize literature review", "thesis", 12, 3, "2.5", "MEDIUM", "HARD"),
    ]
    for key, title, subject, offset, estimate, remaining, priority, difficulty in definitions:
        data = TaskCreate(title=title, subject_id=identifier("subject/" + subject),
                          deadline=local_instant(base + timedelta(days=offset), time(23, 59), timezone),
                          estimated_hours=estimate, remaining_hours=Decimal(remaining),
                          priority=priority, difficulty=difficulty)
        db.add(Task(id=identifier("task/" + key), **task_values(data.model_dump(exclude_none=True))))
    for key, _, _, _ in subjects:
        data = TaskCreate(title="Introductory exercises", subject_id=identifier("subject/" + key),
                          deadline=local_instant(today - timedelta(days=1), time(23, 59), timezone),
                          estimated_hours=2, status="COMPLETED")
        db.add(Task(id=identifier("task/" + key + "-complete"), **task_values(data.model_dump(exclude_none=True))))
    db.flush()
    for offset in range(7):
        db.add(Availability(id=identifier("availability/" + str(offset)), date=base + timedelta(days=offset),
                            start_time=time(17), end_time=time(21 if offset == 1 else 18 if offset == 6 else 20)))
    past = today - timedelta(days=2)
    yesterday = today - timedelta(days=1)
    db.add(Availability(id=identifier("availability/history-1"), date=past, start_time=time(9), end_time=time(14)))
    db.add(Availability(id=identifier("availability/history-2"), date=yesterday, start_time=time(15), end_time=time(20)))
    planned = [
        ("db-assignment", 0, time(17), time(18)),
        ("thesis-papers", 0, time(18), time(19, 30)),
        ("pm-report", 1, time(17), time(19)),
        ("stats-problems", 1, time(19), time(20)),
        ("db-project", 2, time(17), time(18)),
        ("pm-report", 2, time(18), time(19)),
        ("thesis-report", 3, time(17), time(19)),
        ("pm-notes", 5, time(17), time(17, 48)),
        ("stats-review", 5, time(18), time(18, 54)),
    ]
    for index, (task, offset, start, end) in enumerate(planned):
        day = base + timedelta(days=offset)
        _, _, minutes = interval(day, start, end, timezone)
        db.add(StudySession(id=identifier("session/" + str(index)), task_id=identifier("task/" + task),
                            date=day, start_time=start, end_time=end, planned_minutes=minutes,
                            completed_minutes=0, status=StudySessionStatus.PLANNED))
    history = [
        ("databases-complete", past, time(9), time(11), 120, StudySessionStatus.COMPLETED),
        ("management-complete", past, time(12), time(14), 120, StudySessionStatus.COMPLETED),
        ("stats-problems", yesterday, time(16), time(17), 0, StudySessionStatus.MISSED),
        ("thesis-papers", yesterday, time(18), time(19, 30), 30, StudySessionStatus.PARTIALLY_COMPLETED),
    ]
    for index, (task, day, start, end, completed, status) in enumerate(history):
        _, _, minutes = interval(day, start, end, timezone)
        db.add(StudySession(id=identifier("session/history-" + str(index)), task_id=identifier("task/" + task),
                            date=day, start_time=start, end_time=end, planned_minutes=minutes,
                            completed_minutes=completed, status=status))
    db.flush()
    return {"subjects": 4, "tasks": 12, "availability": 9, "study_sessions": 13, "week_start": base.isoformat()}


def main():
    parser = argparse.ArgumentParser(description="Seed empty development core tables. Existing data is never deleted.")
    parser.add_argument("--base-date", type=date.fromisoformat, help="A future Monday; defaults to next Monday.")
    args = parser.parse_args()
    engine = None
    try:
        settings = Settings()
        engine = build_engine(settings)
        with session_factory(engine)() as db, db.begin():
            result = seed_into(db, settings.app_timezone, args.base_date)
        print("Seed committed:", result)
    except DomainError as exc:
        parser.exit(1, exc.detail + "\n")
    except SQLAlchemyError:
        parser.exit(1, "Seed failed. Check DATABASE_URL and apply Alembic migrations first. No partial seed was committed.\n")
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    main()
