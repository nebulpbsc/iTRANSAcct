#!/usr/bin/env python3
"""Add account_id column to transaction_lines table.

Usage:
  python backend/scripts/add_account_id_column.py

Set DATABASE_URL env var to target a non-default DB.
"""
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
import os
import sys


DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./backend/itransacct.db")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args=connect_args, poolclass=NullPool)
else:
    engine = create_engine(DATABASE_URL, connect_args=connect_args)


def sqlite_has_column(conn, table, column):
    r = conn.execute(text(f"PRAGMA table_info('{table}')")).fetchall()
    return any(row[1] == column for row in r)


def main():
    alter_stmt_sqlite = "ALTER TABLE transaction_lines ADD COLUMN account_id TEXT;"
    alter_stmt_other = "ALTER TABLE transaction_lines ADD COLUMN account_id VARCHAR(255);"

    with engine.begin() as conn:
        try:
            if DATABASE_URL.startswith("sqlite"):
                if not sqlite_has_column(conn, "transaction_lines", "account_id"):
                    conn.execute(text(alter_stmt_sqlite))
                    print("Added account_id column to transaction_lines")
                else:
                    print("account_id already exists, skipping")
            else:
                try:
                    conn.execute(text(alter_stmt_other))
                    print("Executed:", alter_stmt_other)
                except Exception as e:
                    print("Statement failed (may already exist):", alter_stmt_other, "->", e)
        except Exception as e:
            print("Migration failed:", e)
            sys.exit(2)

    print("Done")


if __name__ == "__main__":
    main()
