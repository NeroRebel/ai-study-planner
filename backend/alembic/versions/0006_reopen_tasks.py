"""Allow explicit reopening without resetting recorded task progress."""
from alembic import op

revision = "0006_reopen_tasks"
down_revision = "0005_profile_onboarding"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("tasks") as batch:
        batch.drop_constraint(op.f("ck_tasks_zero_remaining_status"), type_="check")


def downgrade():
    # This intentionally fails validation if active zero-effort tasks remain.
    # Close those tasks explicitly before downgrading; never rewrite history.
    with op.batch_alter_table("tasks") as batch:
        batch.create_check_constraint(op.f("ck_tasks_zero_remaining_status"),
            "remaining_hours != 0 OR status IN ('COMPLETED', 'CANCELLED')")
