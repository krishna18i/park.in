"""Database models and the booking state machine.

Lifecycle of a booking, and what it does to its slot:

    PENDING   -> slot RESERVED   (created, awaiting payment, expires after a hold window)
    CONFIRMED -> slot RESERVED   (paid, waiting for the driver to arrive)
    ACTIVE    -> slot OCCUPIED   (driver checked in by QR scan)
    COMPLETED -> slot VACANT     (checked out, slot released)
    CANCELLED -> slot VACANT     (user cancelled before check-in)
    EXPIRED   -> slot VACANT     (never paid within the hold window)
"""
import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, Enum):
    USER = "user"
    ADMIN = "admin"


class SlotStatus(str, Enum):
    VACANT = "vacant"
    RESERVED = "reserved"
    OCCUPIED = "occupied"


class BookingStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class PaymentMethod(str, Enum):
    UPI = "upi"
    CARD = "card"
    CASH = "cash"


class PaymentStatus(str, Enum):
    SUCCESS = "success"
    FAILED = "failed"


# Statuses that still hold a slot -- used to decide whether a slot can be re-booked.
LIVE_BOOKING_STATUSES = (
    BookingStatus.PENDING.value,
    BookingStatus.CONFIRMED.value,
    BookingStatus.ACTIVE.value,
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(20), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(16), default=Role.USER.value)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    bookings: Mapped[list["Booking"]] = relationship(back_populates="user")


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(160))
    address: Mapped[str] = mapped_column(String(400))
    description: Mapped[str] = mapped_column(String(400), default="")
    image_url: Mapped[str] = mapped_column(String(600), default="")
    rows: Mapped[int] = mapped_column(Integer, default=5)
    cols: Mapped[int] = mapped_column(Integer, default=8)
    price_per_hour: Mapped[float] = mapped_column(Float, default=50.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    slots: Mapped[list["Slot"]] = relationship(
        back_populates="location", cascade="all, delete-orphan"
    )


class Slot(Base):
    __tablename__ = "slots"
    __table_args__ = (UniqueConstraint("location_id", "code", name="uq_slot_code_per_location"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    location_id: Mapped[str] = mapped_column(
        ForeignKey("locations.id", ondelete="CASCADE"), index=True
    )
    code: Mapped[str] = mapped_column(String(8))
    row: Mapped[int] = mapped_column(Integer)
    col: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default=SlotStatus.VACANT.value, index=True)

    location: Mapped["Location"] = relationship(back_populates="slots")


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    # SET NULL, not CASCADE: deleting a location must not erase the booking
    # history or invalidate a ticket someone is holding. The denormalised
    # location_name / slot_code below keep those records readable.
    slot_id: Mapped[str | None] = mapped_column(
        ForeignKey("slots.id", ondelete="SET NULL"), index=True, nullable=True
    )
    location_id: Mapped[str | None] = mapped_column(
        ForeignKey("locations.id", ondelete="SET NULL"), index=True, nullable=True
    )

    # Denormalised for fast listing -- a ticket must render even if the
    # location is later deleted by an admin.
    location_name: Mapped[str] = mapped_column(String(160))
    slot_code: Mapped[str] = mapped_column(String(8))

    vehicle_number: Mapped[str] = mapped_column(String(20))
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    hours: Mapped[float] = mapped_column(Float)
    rate_per_hour: Mapped[float] = mapped_column(Float)
    amount: Mapped[float] = mapped_column(Float)

    status: Mapped[str] = mapped_column(String(16), default=BookingStatus.PENDING.value, index=True)
    ticket_code: Mapped[str] = mapped_column(String(16), unique=True, index=True)

    reserved_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checked_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="bookings")
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="booking", cascade="all, delete-orphan"
    )


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    booking_id: Mapped[str] = mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"), index=True)
    amount: Mapped[float] = mapped_column(Float)
    method: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default=PaymentStatus.SUCCESS.value)
    reference: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    booking: Mapped["Booking"] = relationship(back_populates="payments")
