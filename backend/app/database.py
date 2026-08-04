"""
Database configuration.

Uses SQLite by default (file: itransacct.db). To move to Postgres later,
just set the DATABASE_URL environment variable, e.g.:

    export DATABASE_URL="postgresql+psycopg2://user:password@localhost:5432/itransacct"

No other code changes are required — every query in this app goes through
SQLAlchemy's ORM, not raw SQLite syntax, so the same models/routers work
against either engine.
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./itransacct.db")

# connect_args is only needed for SQLite (allows use across FastAPI's threadpool)
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency: yields a DB session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
