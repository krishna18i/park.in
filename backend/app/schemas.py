"""Request/response models."""
import re
from datetime import datetime, timedelta, timezone
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field, field_validator, model_validator

from .feedback import (
    ALL_STATUSES,
    EDIT_WINDOW_HOURS,
    HIGHLIGHT_TAGS,
    ISSUE_TAGS,
    clean_tags,
    split_tags,
)
from .models import BookingStatus, PaymentMethod, SlotKind, SlotStatus


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


class GoogleIn(BaseModel):
    credential: str = Field(min_length=1, max_length=8000)


# ---------------------------------------------------------------- locations
class SlotLayoutCell(BaseModel):
    """One bay in an operator-drawn lot plan, addressed by grid position."""

    row: int = Field(ge=0, le=11)
    col: int = Field(ge=0, le=11)
    kind: SlotKind


def _layout_covers_grid(rows: int, cols: int, cells: list[SlotLayoutCell]) -> None:
    expected = {(r, c) for r in range(rows) for c in range(cols)}
    got = {(cell.row, cell.col) for cell in cells}
    if len(cells) != len(expected) or got != expected:
        raise ValueError("slot layout must include every bay in the grid exactly once")


class LocationIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    address: str = Field(min_length=2, max_length=400)
    description: str = Field(default="", max_length=400)
    image_url: str = Field(default="", max_length=600)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    rows: int = Field(ge=1, le=12)
    cols: int = Field(ge=1, le=12)
    price_per_hour: float = Field(default=50.0, gt=0, le=10000)
    valet_enabled: bool = False
    valet_price_per_hour: float = Field(
        default=80.0, ge=0, le=10000, description="One-time valet fee per booking"
    )
    slot_layout: list[SlotLayoutCell] | None = None

    @model_validator(mode="after")
    def _slot_layout_matches_grid(self):
        if self.slot_layout is not None:
            _layout_covers_grid(self.rows, self.cols, self.slot_layout)
        return self


class LocationLayoutIn(BaseModel):
    slots: list[SlotLayoutCell] = Field(min_length=1)


class LocationUpdate(BaseModel):
    """Operator can change lot details without rebuilding the grid."""

    name: str | None = Field(default=None, min_length=2, max_length=160)
    address: str | None = Field(default=None, min_length=2, max_length=400)
    description: str | None = Field(default=None, max_length=400)
    image_url: str | None = Field(default=None, max_length=600)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    price_per_hour: float | None = Field(default=None, gt=0, le=10000)
    valet_enabled: bool | None = None
    valet_price_per_hour: float | None = Field(default=None, ge=0, le=10000)

    @model_validator(mode="after")
    def _at_least_one_field(self):
        if not self.model_dump(exclude_unset=True):
            raise ValueError("provide at least one field to update")
        return self


class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    address: str
    description: str
    image_url: str
    latitude: float | None = None
    longitude: float | None = None
    rows: int
    cols: int
    price_per_hour: float
    valet_enabled: bool = False
    valet_price_per_hour: float = 80.0
    total_slots: int = 0
    available_slots: int = 0


class LocationValetIn(BaseModel):
    valet_enabled: bool
    valet_price_per_hour: float = Field(gt=0, le=10000)


class PlaceSuggestionOut(BaseModel):
    label: str
    latitude: float
    longitude: float


class NearestBayOut(BaseModel):
    location: LocationOut
    distance_km: float
    destination: str
    destination_latitude: float | None = None
    destination_longitude: float | None = None
    driving: bool = False


class NearbyLotOut(BaseModel):
    location: LocationOut
    distance_km: float


class NearbyLotsOut(BaseModel):
    destination: str
    destination_latitude: float
    destination_longitude: float
    driving: bool = False
    lots: list[NearbyLotOut]


class SlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    code: str
    row: int
    col: int
    status: SlotStatus
    kind: SlotKind = SlotKind.STANDARD

    @field_validator("kind", mode="before")
    @classmethod
    def _valet_is_not_a_bay(cls, value):
        if value in (SlotKind.VALET, SlotKind.VALET.value, "valet"):
            return SlotKind.STANDARD
        return value


class SlotStatusIn(BaseModel):
    status: SlotStatus


# ---------------------------------------------------------------- bookings
class BookingIn(BaseModel):
    slot_id: str
    vehicle_number: str
    start_time: UtcDatetime
    end_time: UtcDatetime
    valet: bool = False

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
    valet: bool = False
    valet_fee: float = 0.0
    status: BookingStatus
    rating: int | None = None
    ticket_code: str
    reserved_until: UtcDatetime | None = None
    checked_in_at: UtcDatetime | None = None
    checked_out_at: UtcDatetime | None = None
    created_at: UtcDatetime


def to_booking_out(booking) -> BookingOut:
    out = BookingOut.model_validate(booking)
    feedback = getattr(booking, "feedback", None)
    if feedback is not None:
        out.rating = feedback.rating
    return out


class TicketOut(BaseModel):
    booking: BookingOut
    qr_data_uri: str
    holder_name: str


class FeedbackIn(BaseModel):
    """A post-visit report. Only the star rating is required."""

    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=1000)

    # Aspect scores -- 0 means "skipped", which is different from a bad score.
    cleanliness: int = Field(default=0, ge=0, le=5)
    safety: int = Field(default=0, ge=0, le=5)
    staff: int = Field(default=0, ge=0, le=5)
    value: int = Field(default=0, ge=0, le=5)

    issues: list[str] = Field(default_factory=list)
    highlights: list[str] = Field(default_factory=list)

    would_recommend: bool | None = None
    contact_me: bool = False
    contact_phone: str = Field(default="", max_length=20)

    @field_validator("issues")
    @classmethod
    def _known_issues(cls, value: list[str]) -> list[str]:
        return clean_tags(value, ISSUE_TAGS)

    @field_validator("highlights")
    @classmethod
    def _known_highlights(cls, value: list[str]) -> list[str]:
        return clean_tags(value, HIGHLIGHT_TAGS)

    @field_validator("comment")
    @classmethod
    def _trim_comment(cls, value: str) -> str:
        return (value or "").strip()

    @field_validator("contact_phone")
    @classmethod
    def _clean_phone(cls, value: str) -> str:
        cleaned = re.sub(r"[^\d+]", "", value or "")
        if cleaned and len(re.sub(r"\D", "", cleaned)) < 10:
            raise ValueError("Enter a 10-digit phone number so care can call back")
        return cleaned


class FeedbackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str = ""
    booking_id: str
    rating: int
    comment: str
    cleanliness: int = 0
    safety: int = 0
    staff: int = 0
    value: int = 0
    issues: list[str] = Field(default_factory=list)
    highlights: list[str] = Field(default_factory=list)
    would_recommend: bool | None = None
    contact_me: bool = False
    contact_phone: str = ""
    reference_code: str = ""
    priority: str = "low"
    status: str = "new"
    operator_note: str = ""
    created_at: UtcDatetime
    updated_at: UtcDatetime | None = None
    editable_until: UtcDatetime | None = None

    @field_validator("issues", "highlights", mode="before")
    @classmethod
    def _unpack_tags(cls, value):
        """Tags live in the row as one comma-separated string; serve a list."""
        return split_tags(value) if isinstance(value, str) else value


def to_feedback_out(row) -> FeedbackOut:
    """Serialise a Feedback row, stamping the window the driver can still edit in."""
    out = FeedbackOut.model_validate(row)
    created = _ensure_utc(row.created_at)
    out.editable_until = created + timedelta(hours=EDIT_WINDOW_HOURS) if created else None
    return out


class TagOut(BaseModel):
    """One selectable chip in the feedback form."""

    id: str
    label: str
    severe: bool = False


class FeedbackOptionsOut(BaseModel):
    issues: list[TagOut]
    highlights: list[TagOut]
    aspects: list[str]
    max_tags: int
    edit_window_hours: int


class TagCountOut(BaseModel):
    id: str
    label: str
    count: int


class FeedbackHighlightOut(BaseModel):
    """A published comment on the lot page -- never carries the driver's name."""

    rating: int
    comment: str
    issues: list[str] = Field(default_factory=list)
    highlights: list[str] = Field(default_factory=list)
    created_at: UtcDatetime


class FeedbackSummaryOut(BaseModel):
    location_id: str
    location_name: str
    count: int
    average: float
    distribution: dict[str, int]
    aspect_averages: dict[str, float]
    recommend_pct: float | None = None
    top_issues: list[TagCountOut]
    top_highlights: list[TagCountOut]
    recent: list[FeedbackHighlightOut]


class AdminFeedbackOut(BaseModel):
    """A report plus the booking context an operator needs to act on it."""

    feedback: FeedbackOut
    booking_id: str
    location_id: str | None = None
    location_name: str
    slot_code: str
    vehicle_number: str
    holder_name: str
    holder_email: str
    holder_phone: str
    checked_out_at: UtcDatetime | None = None


class AdminFeedbackListOut(BaseModel):
    total: int
    open_high_priority: int
    average: float
    items: list[AdminFeedbackOut]


class FeedbackTriageIn(BaseModel):
    status: str | None = None
    operator_note: str | None = Field(default=None, max_length=400)

    @field_validator("status")
    @classmethod
    def _known_status(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if value not in ALL_STATUSES:
            raise ValueError(f"status must be one of {', '.join(ALL_STATUSES)}")
        return value

    @model_validator(mode="after")
    def _at_least_one(self):
        if not self.model_dump(exclude_unset=True):
            raise ValueError("provide a status or a note")
        return self


class NearbyPlaceOut(BaseModel):
    name: str
    category: str
    kind: str = ""
    latitude: float
    longitude: float
    address: str = ""
    phone: str = ""
    website: str = ""
    opening_hours: str = ""
    cuisine: str = ""
    description: str = ""
    image_url: str = ""
    distance_m: int | None = None


class NearbyOut(BaseModel):
    available: bool
    amenities: list[NearbyPlaceOut]
    lot: dict


class OccupancyPointOut(BaseModel):
    hour: str
    label: str
    occupancy_pct: float
    band: str


class OccupancyForecastOut(BaseModel):
    hours: list[OccupancyPointOut]
    hint: str
    model: str


# ---------------------------------------------------------------- payments
class PaymentIn(BaseModel):
    booking_id: str
    method: PaymentMethod
    razorpay_order_id: str | None = None
    razorpay_payment_id: str | None = None
    razorpay_signature: str | None = None


class PaymentConfigOut(BaseModel):
    provider: str
    key_id: str = ""


class PaymentOrderOut(BaseModel):
    provider: str
    order_id: str = ""
    amount: float
    currency: str = "INR"
    key_id: str = ""


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
