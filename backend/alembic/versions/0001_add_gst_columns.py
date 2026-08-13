"""add gst columns to transaction_lines

Revision ID: 0001_add_gst_columns
Revises: 
Create Date: 2026-08-13 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0001_add_gst_columns'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # use batch_alter_table for SQLite compatibility
    with op.batch_alter_table('transaction_lines') as batch_op:
        batch_op.add_column(sa.Column('gst_percent', sa.Float(), nullable=False, server_default=sa.text('0.0')))
        batch_op.add_column(sa.Column('gst_amount', sa.Float(), nullable=False, server_default=sa.text('0.0')))


def downgrade() -> None:
    with op.batch_alter_table('transaction_lines') as batch_op:
        batch_op.drop_column('gst_amount')
        batch_op.drop_column('gst_percent')
