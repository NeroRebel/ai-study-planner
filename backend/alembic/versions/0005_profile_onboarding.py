"""Persist academic setup. Existing profiles bypass onboarding; new profiles do not."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '0005_profile_onboarding'
down_revision = '0004_assistant_actions'
branch_labels = None
depends_on = None

CHECKS = {
    'profile_study_year': 'study_year IS NULL OR study_year BETWEEN 1 AND 12',
    'profile_study_level': "study_level IS NULL OR study_level IN ('Bachelor','Master','PhD','Other')",
    'profile_weekly_hours': 'weekly_study_hours IS NULL OR weekly_study_hours BETWEEN 1 AND 80',
    'profile_session_minutes': 'preferred_session_minutes IS NULL OR preferred_session_minutes IN (30,45,60,90)',
    'profile_study_period': "preferred_study_period IS NULL OR preferred_study_period IN ('Morning','Afternoon','Evening','Flexible')",
    'profile_onboarding_step': 'onboarding_step BETWEEN 1 AND 5',
    'profile_start_mode': "onboarding_start_mode IS NULL OR onboarding_start_mode IN ('manual','ai')",
}
COLUMNS = ['university','study_program','study_level','study_year','weekly_study_hours','preferred_session_minutes','preferred_study_period','preferred_study_days','interests','goals','onboarding_step','onboarding_completed','onboarding_skipped','onboarding_start_mode','onboarding_completed_at']

def upgrade():
    for name,length in [('university',160),('study_program',160),('study_level',20),('preferred_study_period',20),('onboarding_start_mode',10)]:
        op.add_column('profiles',sa.Column(name,sa.String(length),nullable=True))
    for name in ['study_year','weekly_study_hours','preferred_session_minutes']:
        op.add_column('profiles',sa.Column(name,sa.Integer(),nullable=True))
    for name in ['preferred_study_days','interests','goals']:
        op.add_column('profiles',sa.Column(name,sa.JSON().with_variant(JSONB(),'postgresql'),nullable=False,server_default='[]'))
    op.add_column('profiles',sa.Column('onboarding_step',sa.Integer(),nullable=False,server_default='1'))
    # The temporary TRUE default backfills only rows that already exist.
    op.add_column('profiles',sa.Column('onboarding_completed',sa.Boolean(),nullable=False,server_default=sa.true()))
    op.add_column('profiles',sa.Column('onboarding_skipped',sa.Boolean(),nullable=False,server_default=sa.false()))
    op.add_column('profiles',sa.Column('onboarding_completed_at',sa.DateTime(timezone=True),nullable=True))
    op.execute('UPDATE profiles SET onboarding_completed_at = CURRENT_TIMESTAMP WHERE onboarding_completed = true')
    with op.batch_alter_table('profiles') as batch:
        batch.alter_column('onboarding_completed',server_default=sa.false(),existing_type=sa.Boolean(),existing_nullable=False)
        for name,condition in CHECKS.items(): batch.create_check_constraint(op.f('ck_profiles_'+name),condition)
    # Existing profiles RLS, owner policies and Auth foreign key remain in force.

def downgrade():
    with op.batch_alter_table('profiles') as batch:
        for name in CHECKS: batch.drop_constraint(op.f('ck_profiles_'+name),type_='check')
        for name in reversed(COLUMNS): batch.drop_column(name)
