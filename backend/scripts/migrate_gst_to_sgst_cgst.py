#!/usr/bin/env python3
"""One-time data migration: copy existing gst_percent/gst_amount into
sgst_percent/cgst_percent and sgst_amount/cgst_amount by splitting 50/50.

Idempotent: will only update rows where sgst_amount and cgst_amount are 0
and gst_amount exists and > 0.
"""
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
import os
import sys
from decimal import Decimal, ROUND_HALF_UP


DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./backend/itransacct.db")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args=connect_args, poolclass=NullPool)
else:
    engine = create_engine(DATABASE_URL, connect_args=connect_args)


def sqlite_has_column(conn, table, column):
    r = conn.execute(text(f"PRAGMA table_info('{table}')")).fetchall()
    return any(row[1] == column for row in r)


def round2(v):
    return float(Decimal(v).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def main():
    with engine.begin() as conn:
        # detect presence of columns
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info('transaction_lines')")).fetchall()} if DATABASE_URL.startswith("sqlite") else None

        def has(col):
            if cols is not None:
                return col in cols
            # for non-sqlite, best-effort; try a SELECT and catch
            try:
                conn.execute(text(f"SELECT {col} FROM transaction_lines LIMIT 1"))
                return True
            except Exception:
                return False

        if not has('sgst_amount') or not has('cgst_amount'):
            print('sgst/cgst columns not present; data migration requires schema columns. Exiting.')
            return

        if not has('gst_amount'):
            print('No gst_amount column found; nothing to migrate.')
            return

        # select rows where gst_amount > 0 and sgst_amount and cgst_amount are zero or null
        rows = conn.execute(text("SELECT id, gst_percent, gst_amount FROM transaction_lines WHERE gst_amount IS NOT NULL AND gst_amount > 0"))
        updated = 0
        for r in rows:
            id_, gst_percent, gst_amount = r
            # check existing sgst/cgst values
            cur = conn.execute(text("SELECT sgst_amount, cgst_amount, sgst_percent, cgst_percent FROM transaction_lines WHERE id = :id"), {"id": id_}).fetchone()
            if cur and ((cur[0] or 0) != 0 or (cur[1] or 0) != 0 or (cur[2] or 0) != 0 or (cur[3] or 0) != 0):
                # skip rows that already have values
                continue

            gp = float(gst_percent or 0)
            ga = float(gst_amount or 0)
            sgp = gp / 2.0
            cgp = gp / 2.0
            sga = round2(ga / 2.0)
            cga = round2(ga / 2.0)

            conn.execute(
                text(
                    "UPDATE transaction_lines SET sgst_percent = :sgp, cgst_percent = :cgp, sgst_amount = :sga, cgst_amount = :cga WHERE id = :id"
                ),
                {"sgp": sgp, "cgp": cgp, "sga": sga, "cga": cga, "id": id_},
            )
            updated += 1

        print(f"Migration complete. Rows updated: {updated}")


if __name__ == '__main__':
    main()
