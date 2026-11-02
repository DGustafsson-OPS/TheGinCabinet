"""Quick reviews: a gin rated with 1–5 juniper berries and a line or two.

Revision ID: 0019
Revises: 0018
Create Date: 2026-11-02 09:36:32.883373

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0019"
down_revision: str | Sequence[str] | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "quick_reviews",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("gin_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("rating", sa.Numeric(precision=2, scale=1), nullable=False),
        sa.Column("note", sa.String(length=280), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "rating >= 1 AND rating <= 5", name=op.f("ck_quick_reviews_rating_range")
        ),
        sa.ForeignKeyConstraint(
            ["author_id"], ["users.id"], name=op.f("fk_quick_reviews_author_id_users")
        ),
        sa.ForeignKeyConstraint(
            ["gin_id"],
            ["gin_products.id"],
            name=op.f("fk_quick_reviews_gin_id_gin_products"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_quick_reviews")),
        sa.UniqueConstraint("gin_id", "author_id", name="uq_quick_review_per_author"),
    )
    with op.batch_alter_table("quick_reviews", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_quick_reviews_author_id"), ["author_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_quick_reviews_gin_id"), ["gin_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("quick_reviews", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_quick_reviews_gin_id"))
        batch_op.drop_index(batch_op.f("ix_quick_reviews_author_id"))

    op.drop_table("quick_reviews")
