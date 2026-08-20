"""Request/response models."""
import re
from datetime import datetime, timezone
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field, field_validator

from .models import BookingStatus, PaymentMethod, SlotStatus


def _ensure_utc(value):
    """Tag naive datetimes coming out of SQLite as UTC before serialising.

    Without this the API emits '2026-08-20T14:00:00' with no offset and the
    browser reads it as *local* time, shifting every booking by the UTC offset.
    """
    if isinstance(value, datetime) and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


UtcDatetime = Annotated[datetime, BeforeValidator(_ensure_utc)]

VEHICLE_RE = re.compile(r"^[A-Z0-9]{4,12}$")


# ---------------------------------------------------------------- auth
class SignupIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=6, max_length=128)
    phone: str = Field(default="", max_length=20)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: str
    name: str
    phone: str
    role: str


class TokenOut(BaseModel):
    token: str
    user: UserOut


# ---------------------------------------------------------------- locations
class LocationIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    address: str = Field(min_length=2, max_length=400)
    description: str = Field(default="", max_length=400)
    image_url: str = Field(default="", max_length=600)
    rows: int = Field(ge=1, le=12)
    cols: int = Field(ge=1, le=12)
    price_per_hour: float = Field(default=50.0, gt=0, le=10000)


class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    address: str
    description: str
    image_url: str
    rows: int
    cols: int
    price_per_hour: float
    total_slots: int = 0
    available_slots: int = 0


class SlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    code: str
    row: int
    col: int
    status: SlotStatus


class SlotStatusIn(BaseModel):
    status: SlotStatus


# ---------------------------------------------------------------- bookings
class BookingIn(BaseModel):
    slot_id: str
    vehicle_number: str
    start_time: UtcDatetime
    end_time: UtcDatetime

    @field_validator("vehicle_number")
    @classmethod
    def _clean_vehicle(cls, v: str) -> str:
        cleaned = re.sub(r"[\s\-]", "", v).upper()
        if not VEHICLE_RE.match(cleaned):
            raise ValueError("Enter a valid vehicle number, e.g. RJ14AB1234")
        return cleaned


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    slot_id: str | None = None
    location_id: str | None = None
    location_name: str
    slot_code: str
    vehicle_number: str
    start_time: UtcDatetime
    end_time: UtcDatetime
    hours: float
    rate_per_hour: float
    amount: float
    status: BookingStatus
    ticket_code: str
    reserved_until: UtcDatetime | None = None
    checked_in_at: UtcDatetime | None = None
    checked_out_at: UtcDatetime | None = None
    created_at: UtcDatetime


class TicketOut(BaseModel):
    booking: BookingOut
    qr_data_uri: str
    holder_name: str


# ---------------------------------------------------------------- payments
class PaymentIn(BaseModel):
    booking_id: str
    method: PaymentMethod


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    booking_id: str
    amount: float
    method: PaymentMethod
    status: str
    reference: str
    created_at: UtcDatetime


# ---------------------------------------------------------------- admin
class VerifyTicketIn(BaseModel):
    code: str

    @field_validator("code")
    @classmethod
    def _norm(cls, v: str) -> str:
        return v.strip().upper()


class StatsOut(BaseModel):
    total_locations: int
    total_slots: int
    occupied_slots: int
    reserved_slots: int
    vacant_slots: int
    occupancy_rate: float
    total_bookings: int
    active_bookings: int
    total_revenue: float
    revenue_today: float


class MessageOut(BaseModel):
    message: str


class TicketActionOut(BaseModel):
    """Result of scanning a ticket at the gate."""

    action: str  # "checked_in" | "checked_out"
    message: str
    booking: BookingOut
