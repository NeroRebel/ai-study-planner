"""Conservative session origin metadata; legacy rows remain manual.

Revision ID: 0002_session_origin
Revises: 0001_core
"""
from alembic import op
import sqlalchemy as sa

revision = '0002_session_origin'
down_revision = '0001_core'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('study_sessions', sa.Column('origin', sa.String(16), server_default='MANUAL', nullable=False))
    op.create_check_constraint(op.f('ck_study_sessions_origin_valid'), 'study_sessions', "origin IN ('MANUAL', 'SCHEDULER')")


def downgrade():
    op.drop_constraint(op.f('ck_study_sessions_origin_valid'), 'study_sessions', type_='check')
    op.drop_column('study_sessions', 'origin')
