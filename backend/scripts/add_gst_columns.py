#!/usr/bin/env python3
"""Helper script to add SGST/CGST percent and amount columns to
the transaction_lines table. Uses DATABASE_URL if set, otherwise defaults
to a local SQLite file under backend/itransacct.db.

Run:
  python backend/scripts/add_gst_columns.py

Or set DATABASE_URL to your DB and run the script.
"""
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
import os
import sys


DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./backend/itransacct.db")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
if DATABASE_URL.startswith("sqlite"):
    # use NullPool for short-lived scripts to avoid connection pool / threading issues
    engine = create_engine(DATABASE_URL, connect_args=connect_args, poolclass=NullPool)
else:
    engine = create_engine(DATABASE_URL, connect_args=connect_args)


def sqlite_has_column(conn, table, column):
    r = conn.execute(text(f"PRAGMA table_info('{table}')")).fetchall()
    return any(row[1] == column for row in r)


def main():
    alter_stmts = []
    if DATABASE_URL.startswith("sqlite"):
        # For SQLite we still can use simple ALTER TABLE ADD COLUMN
        alter_stmts = [
            "ALTER TABLE transaction_lines ADD COLUMN sgst_percent REAL DEFAULT 0.0;",
            "ALTER TABLE transaction_lines ADD COLUMN cgst_percent REAL DEFAULT 0.0;",
            "ALTER TABLE transaction_lines ADD COLUMN sgst_amount REAL DEFAULT 0.0;",
            "ALTER TABLE transaction_lines ADD COLUMN cgst_amount REAL DEFAULT 0.0;",
        ]
    else:
        alter_stmts = [
            "ALTER TABLE transaction_lines ADD COLUMN sgst_percent double precision NOT NULL DEFAULT 0.0;",
            "ALTER TABLE transaction_lines ADD COLUMN cgst_percent double precision NOT NULL DEFAULT 0.0;",
            "ALTER TABLE transaction_lines ADD COLUMN sgst_amount double precision NOT NULL DEFAULT 0.0;",
            "ALTER TABLE transaction_lines ADD COLUMN cgst_amount double precision NOT NULL DEFAULT 0.0;",
        ]

    with engine.begin() as conn:
        try:
            if DATABASE_URL.startswith("sqlite"):
                # guard: add only if columns don't already exist
                # guard: add only if columns don't already exist
                names = ["sgst_percent", "cgst_percent", "sgst_amount", "cgst_amount"]
                for i, name in enumerate(names):
                    if not sqlite_has_column(conn, "transaction_lines", name):
                        conn.execute(text(alter_stmts[i]))
                        print(f"Added {name} column")
                    else:
                        print(f"{name} already exists, skipping")
            else:
                for s in alter_stmts:
                    try:
                        conn.execute(text(s))
                        print("Executed:", s)
                    except Exception as e:
                        print("Statement failed (may already exist):", s, "->", e)
        except Exception as e:
            print("Migration failed:", e)
            sys.exit(2)

    print("Done")


if __name__ == "__main__":
    main()
