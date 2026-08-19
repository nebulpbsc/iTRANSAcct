"""add account_id to transaction_lines

Revision ID: 0003_add_transaction_line_account
Revises: 0002_add_sgst_cgst_columns
Create Date: 2026-08-19 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0003_add_transaction_line_account'
down_revision = '0002_add_sgst_cgst_columns'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('transaction_lines', schema=None) as batch_op:
        batch_op.add_column(sa.Column('account_id', sa.String(), nullable=True))


def downgrade():
    with op.batch_alter_table('transaction_lines', schema=None) as batch_op:
        batch_op.drop_column('account_id')
