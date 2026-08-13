#!/usr/bin/env python3
"""Simple helper script to add gst_percent and gst_amount columns to
the transaction_lines table. Uses DATABASE_URL if set, otherwise defaults
to a local SQLite file under backend/itransacct.db.

Run:
  python backend/scripts/add_gst_columns.py

Or set DATABASE_URL to your DB and run the script.
"""
from sqlalchemy import create_engine, text
import os
import sys


DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./backend/itransacct.db")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)


def sqlite_has_column(conn, table, column):
    r = conn.execute(text(f"PRAGMA table_info('{table}')")).fetchall()
    return any(row[1] == column for row in r)


def main():
    alter_stmts = []
    if DATABASE_URL.startswith("sqlite"):
        # For SQLite we still can use simple ALTER TABLE ADD COLUMN
        alter_stmts = [
            "ALTER TABLE transaction_lines ADD COLUMN gst_percent REAL DEFAULT 0.0;",
            "ALTER TABLE transaction_lines ADD COLUMN gst_amount REAL DEFAULT 0.0;",
        ]
    else:
        alter_stmts = [
            "ALTER TABLE transaction_lines ADD COLUMN gst_percent double precision NOT NULL DEFAULT 0.0;",
            "ALTER TABLE transaction_lines ADD COLUMN gst_amount double precision NOT NULL DEFAULT 0.0;",
        ]

    with engine.begin() as conn:
        try:
            if DATABASE_URL.startswith("sqlite"):
                # guard: add only if columns don't already exist
                if not sqlite_has_column(conn, "transaction_lines", "gst_percent"):
                    conn.execute(text(alter_stmts[0]))
                    print("Added gst_percent column")
                else:
                    print("gst_percent already exists, skipping")
                if not sqlite_has_column(conn, "transaction_lines", "gst_amount"):
                    conn.execute(text(alter_stmts[1]))
                    print("Added gst_amount column")
                else:
                    print("gst_amount already exists, skipping")
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
