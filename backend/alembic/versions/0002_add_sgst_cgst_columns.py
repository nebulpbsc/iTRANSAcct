"""add sgst/cgst columns to transaction_lines

Revision ID: 0002_add_sgst_cgst_columns
Revises: 0001_add_gst_columns
Create Date: 2026-08-19 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0002_add_sgst_cgst_columns'
down_revision = '0001_add_gst_columns'
branch_labels = None
depends_on = None


def upgrade():
    # SQLite-safe batch operation
    with op.batch_alter_table('transaction_lines', schema=None) as batch_op:
        # add percent columns
        batch_op.add_column(sa.Column('sgst_percent', sa.Float(), nullable=False, server_default=sa.text('0.0')))
        batch_op.add_column(sa.Column('cgst_percent', sa.Float(), nullable=False, server_default=sa.text('0.0')))
        # add amount columns
        batch_op.add_column(sa.Column('sgst_amount', sa.Float(), nullable=False, server_default=sa.text('0.0')))
        batch_op.add_column(sa.Column('cgst_amount', sa.Float(), nullable=False, server_default=sa.text('0.0')))


def downgrade():
    with op.batch_alter_table('transaction_lines', schema=None) as batch_op:
        batch_op.drop_column('cgst_amount')
        batch_op.drop_column('sgst_amount')
        batch_op.drop_column('cgst_percent')
        batch_op.drop_column('sgst_percent')
