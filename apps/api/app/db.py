"""Database connection setup (SQLAlchemy 2.0).

Three key ideas:

* **Engine**: the connection pool to the database. One per application.
* **Session**: a short-lived "unit of work". We open one per HTTP request,
  read and write objects through it, then commit (save) or roll back.
* **Base**: the parent class for our table classes (see ``app/models``).
"""

from collections.abc import Iterator

from sqlalchemy import MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

# A naming convention gives every index/constraint a predictable name, which
# keeps Alembic migrations stable and readable.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Every table class inherits from this."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def make_engine(url: str):
    # SQLite (used only for quick local tests) needs this flag to be shared
    # between threads; PostgreSQL does not.
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args, pool_pre_ping=True)


engine = make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency that gives each request its own database session.

    ``yield`` hands the session to the route function. When the request is
    done, the code after ``yield`` runs and closes the session, even if
    an error happened.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
