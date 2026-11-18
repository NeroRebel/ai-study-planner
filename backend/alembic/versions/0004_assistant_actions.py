"""Expiring assistant commands; no conversation persistence or planner changes."""
from alembic import op
import sqlalchemy as sa
revision = "0004_assistant_actions"
down_revision = "0003_auth_ownership"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("assistant_actions",
        sa.Column("id",sa.Uuid(),primary_key=True),
        sa.Column("user_id",sa.Uuid(),sa.ForeignKey("profiles.user_id",ondelete="CASCADE"),nullable=True),
        sa.Column("kind",sa.String(40),nullable=False),
        sa.Column("payload",sa.JSON(),nullable=False),sa.Column("summary",sa.JSON(),nullable=False),
        sa.Column("fingerprint",sa.String(64),nullable=False),
        sa.Column("expires_at",sa.DateTime(timezone=True),nullable=False),
        sa.Column("status",sa.String(16),nullable=False),sa.Column("result",sa.JSON(),nullable=True),
        sa.Column("created_at",sa.DateTime(timezone=True),server_default=sa.text("CURRENT_TIMESTAMP"),nullable=False),
        sa.Column("updated_at",sa.DateTime(timezone=True),server_default=sa.text("CURRENT_TIMESTAMP"),nullable=False),
        sa.CheckConstraint("status IN ('PENDING','CONFIRMED','CANCELLED')",name="ck_assistant_actions_action_status"))
    op.create_index("ix_assistant_actions_user_id","assistant_actions",["user_id"])
    op.execute("ALTER TABLE public.assistant_actions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.assistant_actions FORCE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON public.assistant_actions FROM anon")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_actions TO authenticated")
    # PostgREST's authenticated role alone is insufficient. Only trusted backend
    # SQL sessions set this transaction-local flag; expose no RPC that sets it.
    rule = "(select auth.uid()) = user_id AND current_setting('app.assistant_access', true) = 'on'"
    op.execute(f"CREATE POLICY assistant_boundary ON public.assistant_actions AS RESTRICTIVE FOR ALL TO public USING ({rule}) WITH CHECK ({rule})")
    op.execute(f"CREATE POLICY assistant_own_rows ON public.assistant_actions FOR ALL TO authenticated USING ({rule}) WITH CHECK ({rule})")

def downgrade():
    op.drop_table("assistant_actions")
