"""create account heads and mappings

Revision ID: 0004_account_heads_mappings
Revises: 0002_add_gst_columns
Create Date: 2026-08-13 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0004_account_heads_mappings'
down_revision = '0001_add_gst_columns'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'account_heads',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('name', sa.String(), nullable=False, unique=True),
        sa.Column('description', sa.Text(), nullable=True),
    )
    op.create_table(
        'account_head_mappings',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('company_id', sa.String(), sa.ForeignKey('companies.id'), nullable=False),
        sa.Column('head_id', sa.String(), sa.ForeignKey('account_heads.id'), nullable=False),
        sa.Column('account_id', sa.String(), sa.ForeignKey('accounts.id'), nullable=False),
    )
    op.create_unique_constraint('uq_company_head', 'account_head_mappings', ['company_id', 'head_id'])

    # seed standard heads (use python-generated ids for portability)
    import uuid
    conn = op.get_bind()
    heads = [
        (uuid.uuid4().hex[:12], 'Sales', 'Default sales account'),
        (uuid.uuid4().hex[:12], 'Purchase', 'Default purchase account'),
        (uuid.uuid4().hex[:12], 'Cash', 'Default cash/bank account'),
    ]
    for hid, name, desc in heads:
        conn.execute(sa.text("INSERT INTO account_heads (id, name, description) VALUES (:id, :name, :desc)"), {"id": hid, "name": name, "desc": desc})


def downgrade() -> None:
    op.drop_table('account_head_mappings')
    op.drop_table('account_heads')
