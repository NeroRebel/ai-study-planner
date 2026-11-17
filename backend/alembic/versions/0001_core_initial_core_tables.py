"""Initial core tables

Revision ID: 0001_core
Revises: 
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '0001_core'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:

    op.create_table('availability',
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('start_time', sa.Time(), nullable=False),
    sa.Column('end_time', sa.Time(), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    sa.CheckConstraint('end_time > start_time', name=op.f('ck_availability_interval_order')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_availability'))
    )
    op.create_index(op.f('ix_availability_date'), 'availability', ['date'], unique=False)
    op.create_table('subjects',
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('color', sa.String(length=32), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_subjects'))
    )
    op.create_table('tasks',
    sa.Column('title', sa.String(length=160), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('subject_id', sa.Uuid(), nullable=False),
    sa.Column('deadline', sa.DateTime(timezone=True), nullable=False),
    sa.Column('estimated_hours', sa.Numeric(precision=12, scale=6), nullable=False),
    sa.Column('remaining_hours', sa.Numeric(precision=12, scale=6), nullable=False),
    sa.Column('priority', sa.Enum('LOW', 'MEDIUM', 'HIGH', name='priority', native_enum=False, create_constraint=True), nullable=False),
    sa.Column('difficulty', sa.Enum('EASY', 'MEDIUM', 'HARD', name='difficulty', native_enum=False, create_constraint=True), nullable=False),
    sa.Column('progress', sa.Integer(), nullable=False),
    sa.Column('status', sa.Enum('TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', name='task_status', native_enum=False, create_constraint=True), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    sa.CheckConstraint("remaining_hours != 0 OR status IN ('COMPLETED', 'CANCELLED')", name=op.f('ck_tasks_zero_remaining_status')),
    sa.CheckConstraint("status != 'COMPLETED' OR (progress = 100 AND remaining_hours = 0)", name=op.f('ck_tasks_completed_consistency')),
    sa.CheckConstraint('estimated_hours > 0', name=op.f('ck_tasks_estimated_positive')),
    sa.CheckConstraint('progress >= 0 AND progress <= 100', name=op.f('ck_tasks_progress_range')),
    sa.CheckConstraint('remaining_hours >= 0 AND remaining_hours <= estimated_hours', name=op.f('ck_tasks_remaining_range')),
    sa.ForeignKeyConstraint(['subject_id'], ['subjects.id'], name=op.f('fk_tasks_subject_id_subjects'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_tasks'))
    )
    op.create_index(op.f('ix_tasks_deadline'), 'tasks', ['deadline'], unique=False)
    op.create_index(op.f('ix_tasks_subject_id'), 'tasks', ['subject_id'], unique=False)
    op.create_table('study_sessions',
    sa.Column('task_id', sa.Uuid(), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('start_time', sa.Time(), nullable=False),
    sa.Column('end_time', sa.Time(), nullable=False),
    sa.Column('planned_minutes', sa.Integer(), nullable=False),
    sa.Column('completed_minutes', sa.Integer(), nullable=False),
    sa.Column('status', sa.Enum('PLANNED', 'COMPLETED', 'MISSED', 'PARTIALLY_COMPLETED', name='study_session_status', native_enum=False, create_constraint=True), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    sa.CheckConstraint("(status IN ('PLANNED', 'MISSED') AND completed_minutes = 0) OR (status = 'COMPLETED' AND completed_minutes = planned_minutes) OR (status = 'PARTIALLY_COMPLETED' AND completed_minutes > 0 AND completed_minutes < planned_minutes)", name=op.f('ck_study_sessions_outcome_consistency')),
    sa.CheckConstraint('completed_minutes >= 0 AND completed_minutes <= planned_minutes', name=op.f('ck_study_sessions_completed_range')),
    sa.CheckConstraint('end_time > start_time', name=op.f('ck_study_sessions_interval_order')),
    sa.CheckConstraint('planned_minutes > 0', name=op.f('ck_study_sessions_planned_positive')),
    sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], name=op.f('fk_study_sessions_task_id_tasks'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_study_sessions'))
    )
    op.create_index(op.f('ix_study_sessions_date'), 'study_sessions', ['date'], unique=False)
    op.create_index(op.f('ix_study_sessions_task_id'), 'study_sessions', ['task_id'], unique=False)


def downgrade() -> None:

    op.drop_index(op.f('ix_study_sessions_task_id'), table_name='study_sessions')
    op.drop_index(op.f('ix_study_sessions_date'), table_name='study_sessions')
    op.drop_table('study_sessions')
    op.drop_index(op.f('ix_tasks_subject_id'), table_name='tasks')
    op.drop_index(op.f('ix_tasks_deadline'), table_name='tasks')
    op.drop_table('tasks')
    op.drop_table('subjects')
    op.drop_index(op.f('ix_availability_date'), table_name='availability')
    op.drop_table('availability')

