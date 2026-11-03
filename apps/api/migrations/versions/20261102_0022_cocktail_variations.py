"""Cocktail variations: recipes linked both ways (Negroni ↔ Boulevardier).

Revision ID: 0022
Revises: 0021
Create Date: 2026-11-02 14:23:01.884566

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0022"
down_revision: str | Sequence[str] | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "cocktail_variations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("recipe_a_id", sa.Uuid(), nullable=False),
        sa.Column("recipe_b_id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "recipe_a_id <> recipe_b_id", name=op.f("ck_cocktail_variations_not_itself")
        ),
        sa.ForeignKeyConstraint(
            ["recipe_a_id"],
            ["cocktail_recipes.id"],
            name=op.f("fk_cocktail_variations_recipe_a_id_cocktail_recipes"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["recipe_b_id"],
            ["cocktail_recipes.id"],
            name=op.f("fk_cocktail_variations_recipe_b_id_cocktail_recipes"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cocktail_variations")),
        sa.UniqueConstraint("recipe_a_id", "recipe_b_id", name="uq_cocktail_variation_pair"),
    )
    with op.batch_alter_table("cocktail_variations", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_cocktail_variations_recipe_a_id"), ["recipe_a_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_cocktail_variations_recipe_b_id"), ["recipe_b_id"], unique=False
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("cocktail_variations", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_cocktail_variations_recipe_b_id"))
        batch_op.drop_index(batch_op.f("ix_cocktail_variations_recipe_a_id"))

    op.drop_table("cocktail_variations")
