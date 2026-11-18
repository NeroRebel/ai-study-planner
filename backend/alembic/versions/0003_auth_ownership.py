"""Personal profiles, quarantined legacy rows, ownership constraints and RLS.

Revision ID: 0003_auth_ownership
Revises: 0002_session_origin
"""
from alembic import op
import sqlalchemy as sa
revision='0003_auth_ownership'
down_revision='0002_session_origin'
branch_labels=None
depends_on=None
TABLES=('subjects','tasks','availability','study_sessions')


def upgrade():
    op.create_table('profiles',
        sa.Column('user_id',sa.Uuid(),primary_key=True),
        sa.Column('display_name',sa.String(80),nullable=False,server_default='Student'),
        sa.Column('avatar_path',sa.String(512),nullable=True),
        sa.Column('timezone',sa.String(64),nullable=False,server_default='Europe/Budapest'),
        sa.Column('created_at',sa.DateTime(timezone=True),nullable=False,server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at',sa.DateTime(timezone=True),nullable=False,server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.CheckConstraint("timezone = 'Europe/Budapest'",name='ck_profiles_profile_timezone'),
        sa.CheckConstraint("replace(avatar_path, '-', '') LIKE replace(CAST(user_id AS VARCHAR), '-', '') || '/%' OR avatar_path IS NULL",name='ck_profiles_avatar_owner'))
    # Supabase owns auth.users; keep that external relationship in this migration.
    op.create_foreign_key('fk_profiles_auth_user','profiles','users',['user_id'],['id'],referent_schema='auth',ondelete='CASCADE')
    for table in TABLES:
        op.add_column(table,sa.Column('user_id',sa.Uuid(),nullable=True))
        op.create_foreign_key(f'fk_{table}_user_id_profiles',table,'profiles',['user_id'],['user_id'],ondelete='CASCADE')
        op.create_index(f'ix_{table}_user_id',table,['user_id'])
    op.create_unique_constraint('uq_subjects_owner_id','subjects',['user_id','id'])
    op.create_unique_constraint('uq_tasks_owner_id','tasks',['user_id','id'])
    # Deferred NO ACTION permits an auth-user deletion to cascade through all
    # owned rows in one transaction, without subject/task cascade-order failures.
    op.drop_constraint('fk_tasks_subject_id_subjects','tasks',type_='foreignkey')
    op.create_foreign_key('fk_tasks_subject_id_subjects','tasks','subjects',['subject_id'],['id'],deferrable=True,initially='DEFERRED')
    op.create_foreign_key('fk_tasks_owned_subject','tasks','subjects',['user_id','subject_id'],['user_id','id'],deferrable=True,initially='DEFERRED')
    op.create_foreign_key('fk_sessions_owned_task','study_sessions','tasks',['user_id','task_id'],['user_id','id'],deferrable=True,initially='DEFERRED')
    for table in (*TABLES,'profiles'):
        op.execute(f'ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY')
        op.execute(f'ALTER TABLE public.{table} FORCE ROW LEVEL SECURITY')
        op.execute(f'REVOKE ALL ON public.{table} FROM anon')
        op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON public.{table} TO authenticated')
        op.execute(f'''CREATE POLICY owner_boundary ON public.{table} AS RESTRICTIVE FOR ALL TO public
            USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id)''')
        op.execute(f'''CREATE POLICY own_rows ON public.{table} FOR ALL TO authenticated
            USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id)''')
    # No legacy data is assigned to a user or deleted.


def downgrade():
    # Do not discard owned data silently as part of a schema rollback.
    op.execute("DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.profiles) THEN RAISE EXCEPTION 'Export/remove authenticated accounts before downgrading ownership'; END IF; END $$")
    for table in (*TABLES,'profiles'):
        op.execute(f'DROP POLICY own_rows ON public.{table}')
        op.execute(f'DROP POLICY owner_boundary ON public.{table}')
        op.execute(f'ALTER TABLE public.{table} DISABLE ROW LEVEL SECURITY')
    op.drop_constraint('fk_sessions_owned_task','study_sessions',type_='foreignkey')
    op.drop_constraint('fk_tasks_owned_subject','tasks',type_='foreignkey')
    op.drop_constraint('fk_tasks_subject_id_subjects','tasks',type_='foreignkey')
    op.create_foreign_key('fk_tasks_subject_id_subjects','tasks','subjects',['subject_id'],['id'],ondelete='RESTRICT')
    op.drop_constraint('uq_tasks_owner_id','tasks',type_='unique')
    op.drop_constraint('uq_subjects_owner_id','subjects',type_='unique')
    for table in reversed(TABLES):
        op.drop_index(f'ix_{table}_user_id',table_name=table)
        op.drop_constraint(f'fk_{table}_user_id_profiles',table,type_='foreignkey')
        op.drop_column(table,'user_id')
    op.drop_table('profiles')
