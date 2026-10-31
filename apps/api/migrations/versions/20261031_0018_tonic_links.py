"""Tonic links: tonics to use in a cocktail, and gins a tonic suits.

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-31 17:51:53.819856

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0018"
down_revision: str | Sequence[str] | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "cocktail_tonic_recommendations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("recipe_id", sa.Uuid(), nullable=False),
        sa.Column("tonic_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("pairing_note", sa.String(length=300), nullable=True),
        sa.ForeignKeyConstraint(
            ["recipe_id"],
            ["cocktail_recipes.id"],
            name=op.f("fk_cocktail_tonic_recommendations_recipe_id_cocktail_recipes"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tonic_id"],
            ["tonics.id"],
            name=op.f("fk_cocktail_tonic_recommendations_tonic_id_tonics"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cocktail_tonic_recommendations")),
        sa.UniqueConstraint("recipe_id", "tonic_id", name="uq_cocktail_tonic_pair"),
    )
    with op.batch_alter_table("cocktail_tonic_recommendations", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_cocktail_tonic_recommendations_recipe_id"), ["recipe_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_cocktail_tonic_recommendations_tonic_id"), ["tonic_id"], unique=False
        )

    op.create_table(
        "gin_tonic_pairings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tonic_id", sa.Uuid(), nullable=False),
        sa.Column("gin_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("pairing_note", sa.String(length=300), nullable=True),
        sa.ForeignKeyConstraint(
            ["gin_id"],
            ["gin_products.id"],
            name=op.f("fk_gin_tonic_pairings_gin_id_gin_products"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tonic_id"],
            ["tonics.id"],
            name=op.f("fk_gin_tonic_pairings_tonic_id_tonics"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_gin_tonic_pairings")),
        sa.UniqueConstraint("tonic_id", "gin_id", name="uq_gin_tonic_pair"),
    )
    with op.batch_alter_table("gin_tonic_pairings", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_gin_tonic_pairings_gin_id"), ["gin_id"], unique=False)
        batch_op.create_index(
            batch_op.f("ix_gin_tonic_pairings_tonic_id"), ["tonic_id"], unique=False
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("gin_tonic_pairings", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_gin_tonic_pairings_tonic_id"))
        batch_op.drop_index(batch_op.f("ix_gin_tonic_pairings_gin_id"))

    op.drop_table("gin_tonic_pairings")
    with op.batch_alter_table("cocktail_tonic_recommendations", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_cocktail_tonic_recommendations_tonic_id"))
        batch_op.drop_index(batch_op.f("ix_cocktail_tonic_recommendations_recipe_id"))

    op.drop_table("cocktail_tonic_recommendations")
