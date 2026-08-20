"""Booking rules shared by the routers: pricing, slot transitions, expiry."""
import math
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .config import RESERVATION_HOLD_MINUTES
from .models import Booking, BookingStatus, Location, Slot, SlotStatus
from .realtime import manager
from .utils import as_utc

MIN_BILLABLE_HOURS = 1.0
BILLING_BLOCK_HOURS = 0.5  # charged in half-hour blocks, rounded up


def price_booking(location: Location, start: datetime, end: datetime) -> tuple[float, float]:
    """Return (billable_hours, amount) for a stay.

    Part-hours round up to the next half hour and every stay bills at least one
    hour, which is how real parking operators price and avoids ~0 rupee bookings.
    """
    raw_hours = (end - start).total_seconds() / 3600
    blocks = math.ceil(raw_hours / BILLING_BLOCK_HOURS)
    hours = max(MIN_BILLABLE_HOURS, blocks * BILLING_BLOCK_HOURS)
    return hours, round(hours * location.price_per_hour, 2)


def hold_deadline() -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=RESERVATION_HOLD_MINUTES)


def slot_event(slot: Slot) -> dict:
    return {
        "id": slot.id,
        "location_id": slot.location_id,
        "code": slot.code,
        "row": slot.row,
        "col": slot.col,
        "status": slot.status,
    }


def claim_slot(db: Session, slot_id: str) -> bool:
    """Atomically move a slot VACANT -> RESERVED.

    Written as a conditional UPDATE rather than read-then-write so two people
    clicking the same slot at the same moment cannot both succeed -- the second
    UPDATE matches zero rows.
    """
    result = db.execute(
        update(Slot)
        .where(Slot.id == slot_id, Slot.status == SlotStatus.VACANT.value)
        .values(status=SlotStatus.RESERVED.value)
    )
    return result.rowcount == 1


def set_slot_status(db: Session, slot_id: str, status: SlotStatus) -> Slot | None:
    db.execute(update(Slot).where(Slot.id == slot_id).values(status=status.value))
    return db.get(Slot, slot_id)


async def announce_slot(db: Session, slot_id: str) -> None:
    slot = db.get(Slot, slot_id)
    if slot is not None:
        db.refresh(slot)
        await manager.broadcast("slot.updated", slot_event(slot))


def expire_stale_bookings(db: Session) -> list[Slot]:
    """Release slots held by bookings that were never paid for.

    Returns the slots that were freed so the caller can broadcast them.
    """
    now = datetime.now(timezone.utc)
    stale = (
        db.execute(
            select(Booking).where(
                Booking.status == BookingStatus.PENDING.value,
                Booking.reserved_until.is_not(None),
            )
        )
        .scalars()
        .all()
    )

    freed: list[Slot] = []
    for booking in stale:
        deadline = as_utc(booking.reserved_until)
        if deadline is None or deadline > now:
            continue
        booking.status = BookingStatus.EXPIRED.value
        slot = set_slot_status(db, booking.slot_id, SlotStatus.VACANT)
        if slot is not None:
            freed.append(slot)

    if freed:
        db.commit()
    return freed
