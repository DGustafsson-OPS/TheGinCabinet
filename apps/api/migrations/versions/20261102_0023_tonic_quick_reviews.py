"""Quick reviews for tonics too: a quick review is of a gin or of a tonic.

Revision ID: 0023
Revises: 0022
Create Date: 2026-11-02 14:30:42.917712

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0023"
down_revision: str | Sequence[str] | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("quick_reviews", schema=None) as batch_op:
        batch_op.add_column(sa.Column("tonic_id", sa.Uuid(), nullable=True))
        batch_op.alter_column("gin_id", existing_type=sa.Uuid(), nullable=True)
        batch_op.create_index(batch_op.f("ix_quick_reviews_tonic_id"), ["tonic_id"], unique=False)
        batch_op.create_unique_constraint(
            "uq_tonic_quick_review_per_author", ["tonic_id", "author_id"]
        )
        batch_op.create_foreign_key(
            batch_op.f("fk_quick_reviews_tonic_id_tonics"),
            "tonics",
            ["tonic_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_check_constraint(
            op.f("ck_quick_reviews_gin_or_tonic"), "(gin_id IS NULL) <> (tonic_id IS NULL)"
        )


def downgrade() -> None:
    """Downgrade schema. Quick reviews of tonics are deleted (gins only before)."""
    op.execute("DELETE FROM quick_reviews WHERE gin_id IS NULL")
    with op.batch_alter_table("quick_reviews", schema=None) as batch_op:
        batch_op.drop_constraint(op.f("ck_quick_reviews_gin_or_tonic"), type_="check")
        batch_op.drop_constraint(batch_op.f("fk_quick_reviews_tonic_id_tonics"), type_="foreignkey")
        batch_op.drop_constraint("uq_tonic_quick_review_per_author", type_="unique")
        batch_op.drop_index(batch_op.f("ix_quick_reviews_tonic_id"))
        batch_op.alter_column("gin_id", existing_type=sa.Uuid(), nullable=False)
        batch_op.drop_column("tonic_id")
