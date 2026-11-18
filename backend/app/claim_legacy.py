"""Explicit administrator-only legacy claim. Never called by an API or login."""
import argparse
from uuid import UUID
from sqlalchemy import select, update
from app.core.config import Settings
from app.db.session import build_engine, session_factory
from app.models import Subject, Task, Availability, StudySession
from app.services.profiles import bootstrap
from app.services.common import serialize_write


def claim(db, user_id):
    serialize_write(db)
    bootstrap(db,user_id)  # auth.users FK rejects nonexistent identities in Supabase.
    counts={}
    for model in (Subject,Task,Availability,StudySession):
        result=db.execute(update(model).where(model.user_id.is_(None)).values(user_id=user_id))
        counts[model.__tablename__]=result.rowcount
    db.commit()
    return counts


def main():
    parser=argparse.ArgumentParser(description='Claim ALL quarantined legacy rows for an explicitly selected existing Auth user.')
    parser.add_argument('--user-id',type=UUID,required=True)
    parser.add_argument('--confirm-claim-legacy',action='store_true',required=True)
    args=parser.parse_args()
    engine=build_engine(Settings())
    try:
        with session_factory(engine)() as db:
            try:print(claim(db,args.user_id))
            except Exception:
                db.rollback();raise SystemExit('Legacy claim failed. No claim transaction was committed. Review identity and parent ownership.') from None
    finally:engine.dispose()

if __name__=='__main__':main()
