"""SQLAlchemy engine + session wiring."""
from collections.abc import Iterator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import DATABASE_URL

_is_sqlite = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    future=True,
)

if _is_sqlite:

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _record):
        cur = dbapi_connection.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")  # concurrent reads during a demo
        cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


class Base(DeclarativeBase):
    pass


def _add_column(conn, table: str, column: str, ddl: str) -> None:
    cols = {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})"))}
    if column not in cols:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))


def ensure_schema() -> None:
    """Add columns that `create_all` will not attach to an existing SQLite file."""
    if not _is_sqlite:
        return
    with engine.begin() as conn:
        tables = {row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))}
        if "locations" in tables:
            _add_column(conn, "locations", "latitude", "latitude FLOAT")
            _add_column(conn, "locations", "longitude", "longitude FLOAT")
            _add_column(conn, "locations", "valet_enabled", "valet_enabled BOOLEAN DEFAULT 0")
            _add_column(conn, "locations", "valet_price_per_hour", "valet_price_per_hour FLOAT DEFAULT 80")
            _add_column(conn, "locations", "contact_name", "contact_name VARCHAR(120) DEFAULT ''")
            _add_column(conn, "locations", "contact_phone", "contact_phone VARCHAR(20) DEFAULT ''")
            _add_column(conn, "locations", "contact_email", "contact_email VARCHAR(255) DEFAULT ''")
        if "slots" in tables:
            _add_column(conn, "slots", "kind", "kind VARCHAR(16) DEFAULT 'standard'")
            conn.execute(text("UPDATE slots SET kind = 'standard' WHERE kind = 'valet'"))
        if "bookings" in tables:
            _add_column(conn, "bookings", "valet", "valet BOOLEAN DEFAULT 0")
            _add_column(conn, "bookings", "valet_fee", "valet_fee FLOAT DEFAULT 0")
            _add_column(conn, "bookings", "booking_type", "booking_type VARCHAR(16) DEFAULT 'parking'")
            _add_column(conn, "bookings", "cargo_type", "cargo_type VARCHAR(80) DEFAULT ''")
            _add_column(conn, "bookings", "delivery_reference", "delivery_reference VARCHAR(80) DEFAULT ''")
        if "users" in tables:
            _add_column(conn, "users", "auth_provider", "auth_provider VARCHAR(16) DEFAULT 'password'")
        if "feedback" in tables:
            # Feedback grew from "stars + a line of text" into a structured
            # report; existing rows keep their rating and pick up the defaults.
            _add_column(conn, "feedback", "cleanliness", "cleanliness INTEGER DEFAULT 0")
            _add_column(conn, "feedback", "safety", "safety INTEGER DEFAULT 0")
            _add_column(conn, "feedback", "staff", "staff INTEGER DEFAULT 0")
            _add_column(conn, "feedback", "value", "value INTEGER DEFAULT 0")
            _add_column(conn, "feedback", "issues", "issues VARCHAR(400) DEFAULT ''")
            _add_column(conn, "feedback", "highlights", "highlights VARCHAR(400) DEFAULT ''")
            _add_column(conn, "feedback", "would_recommend", "would_recommend BOOLEAN")
            _add_column(conn, "feedback", "contact_me", "contact_me BOOLEAN DEFAULT 0")
            _add_column(conn, "feedback", "contact_phone", "contact_phone VARCHAR(20) DEFAULT ''")
            _add_column(conn, "feedback", "reference_code", "reference_code VARCHAR(16) DEFAULT ''")
            _add_column(conn, "feedback", "priority", "priority VARCHAR(8) DEFAULT 'low'")
            _add_column(conn, "feedback", "status", "status VARCHAR(16) DEFAULT 'new'")
            _add_column(conn, "feedback", "operator_note", "operator_note VARCHAR(400) DEFAULT ''")
            _add_column(conn, "feedback", "updated_at", "updated_at DATETIME")
            conn.execute(text("UPDATE feedback SET updated_at = created_at WHERE updated_at IS NULL"))


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
