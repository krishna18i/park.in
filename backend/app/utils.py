"""Small shared helpers."""
import secrets
from datetime import datetime, timezone

_TICKET_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no I/O/0/1 -- unambiguous when read aloud


def as_utc(value: datetime | None) -> datetime | None:
    """SQLite drops tzinfo on write, so datetimes read back are naive.

    Everything is stored as UTC, so a naive value is re-tagged as UTC. Without
    this, comparing a stored time against ``datetime.now(timezone.utc)`` raises
    ``TypeError: can't compare offset-naive and offset-aware datetimes``.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def new_ticket_code() -> str:
    """Short, human-readable ticket id, e.g. PKN-7QF3KD."""
    body = "".join(secrets.choice(_TICKET_ALPHABET) for _ in range(6))
    return f"PKN-{body}"


def new_reference(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(8)}"
