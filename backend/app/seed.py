"""Demo data.

Runs once on first boot so the app is never an empty shell in front of judges.
Uses a fixed RNG seed, so every teammate's laptop shows the same lot layout,
the same occupancy and the same revenue figure.
"""
import logging
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import (
    Booking,
    BookingStatus,
    Location,
    Payment,
    PaymentMethod,
    PaymentStatus,
    Role,
    Slot,
    SlotStatus,
    User,
)
from .routers.locations import build_slots
from .security import hash_password
from .services import price_booking
from .utils import new_reference, new_ticket_code

logger = logging.getLogger(__name__)

RNG = random.Random(20260820)

DEMO_ADMIN = {"email": "admin@parkin.app", "password": "admin123", "name": "Operations Admin"}
DEMO_USER = {"email": "demo@parkin.app", "password": "demo123", "name": "Aarav Sharma"}

LOCATIONS = [
    {
        "name": "Hawa Mahal",
        "address": "Hawa Mahal Rd, Badi Choupad, Jaipur",
        "description": "Palace of Winds -- the pink sandstone icon of the old city.",
        "image_url": "https://images.unsplash.com/photo-1701087366618-112f1b333a9f?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
        "rows": 6,
        "cols": 8,
        "price_per_hour": 60.0,
    },
    {
        "name": "City Palace",
        "address": "Tulsi Marg, Gangori Bazaar, Jaipur",
        "description": "Royal residence with museums, courtyards and the Peacock Gate.",
        "image_url": "https://images.unsplash.com/photo-1607160913575-9854cbecca02?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
        "rows": 7,
        "cols": 8,
        "price_per_hour": 50.0,
    },
    {
        "name": "Jal Mahal",
        "address": "Amer Rd, Jal Mahal, Jaipur",
        "description": "The Water Palace, adrift in the middle of Man Sagar Lake.",
        "image_url": "https://images.unsplash.com/photo-1599661046289-e31897846e41?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
        "rows": 5,
        "cols": 8,
        "price_per_hour": 40.0,
    },
    {
        "name": "Nahargarh Fort",
        "address": "Krishna Nagar, Brahampuri, Jaipur",
        "description": "Hilltop fort with the city spread out below it at sunset.",
        "image_url": "https://images.unsplash.com/photo-1609137144813-7d9921338f24?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
        "rows": 6,
        "cols": 6,
        "price_per_hour": 45.0,
    },
]

VEHICLE_SERIES = ["RJ14", "RJ45", "RJ19", "DL8C", "HR26", "UP32", "MH12", "GJ01"]


def _plate() -> str:
    letters = "".join(RNG.choice("ABCDEFGHJKLMNPQRSTUVWXYZ") for _ in range(2))
    return f"{RNG.choice(VEHICLE_SERIES)}{letters}{RNG.randrange(1000, 9999)}"


def _make_user(db: Session, spec: dict, role: Role, phone: str) -> User:
    user = User(
        email=spec["email"],
        name=spec["name"],
        phone=phone,
        password_hash=hash_password(spec["password"]),
        role=role.value,
    )
    db.add(user)
    return user


def _make_booking(
    db: Session,
    *,
    user: User,
    location: Location,
    slot: Slot,
    start: datetime,
    end: datetime,
    status: BookingStatus,
) -> Booking:
    hours, amount = price_booking(location, start, end)
    booking = Booking(
        user_id=user.id,
        slot_id=slot.id,
        location_id=location.id,
        location_name=location.name,
        slot_code=slot.code,
        vehicle_number=_plate(),
        start_time=start,
        end_time=end,
        hours=hours,
        rate_per_hour=location.price_per_hour,
        amount=amount,
        status=status.value,
        ticket_code=new_ticket_code(),
    )
    if status is BookingStatus.ACTIVE:
        booking.checked_in_at = start
        slot.status = SlotStatus.OCCUPIED.value
    elif status is BookingStatus.COMPLETED:
        booking.checked_in_at = start
        booking.checked_out_at = end
        slot.status = SlotStatus.VACANT.value

    # Appended through the relationship rather than passing booking_id=: the id
    # is a column default, so it is still None until the row is flushed.
    booking.payments.append(
        Payment(
            amount=amount,
            method=RNG.choice(list(PaymentMethod)).value,
            status=PaymentStatus.SUCCESS.value,
            reference=new_reference("seed"),
        )
    )
    db.add(booking)
    return booking


def seed(db: Session) -> bool:
    """Populate demo data. No-op if anything is already there."""
    if db.execute(select(func.count(Location.id))).scalar_one() > 0:
        return False

    now = datetime.now(timezone.utc)

    _make_user(db, DEMO_ADMIN, Role.ADMIN, "+91 98290 00001")
    driver = _make_user(db, DEMO_USER, Role.USER, "+91 98290 12345")
    db.flush()

    for spec in LOCATIONS:
        location = Location(**spec)
        db.add(location)
        db.flush()

        slots = build_slots(location)
        db.add_all(slots)
        db.flush()

        # Park real cars in roughly a quarter of the bays, each backed by a
        # genuine ACTIVE booking, so occupancy on the admin dashboard is real data
        # rather than a random status string.
        parked = RNG.sample(slots, k=max(1, int(len(slots) * 0.25)))
        for slot in parked:
            start = now - timedelta(minutes=RNG.randrange(20, 240))
            _make_booking(
                db,
                user=driver,
                location=location,
                slot=slot,
                start=start,
                end=start + timedelta(hours=RNG.choice([1, 2, 3, 4])),
                status=BookingStatus.ACTIVE,
            )

        # A short history of finished stays gives the revenue chart something
        # to show on day one.
        for slot in RNG.sample([s for s in slots if s not in parked], k=4):
            start = now - timedelta(hours=RNG.randrange(6, 72))
            _make_booking(
                db,
                user=driver,
                location=location,
                slot=slot,
                start=start,
                end=start + timedelta(hours=RNG.choice([1, 2, 3])),
                status=BookingStatus.COMPLETED,
            )

    db.commit()
    logger.info(
        "seeded %d locations | admin=%s / %s | user=%s / %s",
        len(LOCATIONS),
        DEMO_ADMIN["email"],
        DEMO_ADMIN["password"],
        DEMO_USER["email"],
        DEMO_USER["password"],
    )
    return True
