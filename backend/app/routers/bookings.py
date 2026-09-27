"""Booking lifecycle: reserve, cancel, check in, check out, and the QR ticket."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..feedback import EDIT_WINDOW_HOURS, FeedbackStatus, join_tags, new_reference, priority_for
from ..models import Booking, BookingStatus, BookingType, Feedback, Location, Role, Slot, SlotKind, SlotStatus, User
from ..qr import qr_data_uri
from ..schemas import (
    BookingIn,
    BookingOut,
    FeedbackIn,
    FeedbackOut,
    TicketOut,
    to_booking_out,
    to_feedback_out,
)
from ..security import current_user
from ..services import announce_slot, claim_slot, hold_deadline, price_booking, set_slot_status
from ..utils import as_utc, new_ticket_code

router = APIRouter(prefix="/bookings", tags=["bookings"])

MAX_STAY_HOURS = 24
MIN_LOGISTICS_DWELL_MINUTES = 15
MAX_LOGISTICS_DWELL_HOURS = 2
PAST_START_GRACE = timedelta(minutes=5)


def _load_for_user(db: Session, booking_id: str, user: User) -> Booking:
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    if booking.user_id != user.id and user.role != Role.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="That booking belongs to someone else"
        )
    return booking


@router.post("", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
async def create_booking(
    payload: BookingIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> BookingOut:
    now = datetime.now(timezone.utc)

    if payload.end_time <= payload.start_time:
        raise HTTPException(status_code=400, detail="End time must be after start time")
    if payload.start_time < now - PAST_START_GRACE:
        raise HTTPException(status_code=400, detail="Start time cannot be in the past")
    if payload.end_time - payload.start_time > timedelta(hours=MAX_STAY_HOURS):
        raise HTTPException(
            status_code=400, detail=f"Bookings are capped at {MAX_STAY_HOURS} hours"
        )

    if (
        payload.booking_type is BookingType.LOGISTICS
        and payload.end_time - payload.start_time > timedelta(hours=MAX_LOGISTICS_DWELL_HOURS)
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Loading-zone reservations are capped at {MAX_LOGISTICS_DWELL_HOURS} hours",
        )
    if (
        payload.booking_type is BookingType.LOGISTICS
        and payload.end_time - payload.start_time < timedelta(minutes=MIN_LOGISTICS_DWELL_MINUTES)
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Loading-zone reservations must be at least {MIN_LOGISTICS_DWELL_MINUTES} minutes",
        )

    slot = db.get(Slot, payload.slot_id)
    if slot is None:
        raise HTTPException(status_code=404, detail="Slot not found")

    location = db.get(Location, slot.location_id)
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")

    if payload.booking_type is BookingType.LOGISTICS and slot.kind != SlotKind.HEAVY.value:
        raise HTTPException(
            status_code=400,
            detail="Logistics reservations require a heavy/loading bay",
        )

    want_valet = bool(payload.valet) and payload.booking_type is BookingType.PARKING
    if want_valet and not location.valet_enabled:
        raise HTTPException(
            status_code=400,
            detail="Valet is not available at this lot right now. The operator has it switched off.",
        )
    if want_valet and slot.kind == SlotKind.HEAVY.value:
        raise HTTPException(
            status_code=400,
            detail="Valet is not available for truck bays.",
        )

    # Atomic claim -- if someone else took this slot a moment ago this fails
    # cleanly instead of double-booking it.
    if not claim_slot(db, slot.id):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Slot {slot.code} was just taken. Pick another one.",
        )

    hours, amount, valet_fee = price_booking(
        location, payload.start_time, payload.end_time, valet=want_valet
    )
    booking = Booking(
        user_id=user.id,
        slot_id=slot.id,
        location_id=location.id,
        location_name=location.name,
        slot_code=slot.code,
        vehicle_number=payload.vehicle_number,
        start_time=payload.start_time,
        end_time=payload.end_time,
        hours=hours,
        rate_per_hour=location.price_per_hour,
        amount=amount,
        valet=want_valet,
        valet_fee=valet_fee,
        booking_type=payload.booking_type.value,
        cargo_type=payload.cargo_type,
        delivery_reference=payload.delivery_reference,
        status=BookingStatus.PENDING.value,
        ticket_code=new_ticket_code(),
        reserved_until=hold_deadline(),
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    await announce_slot(db, slot.id)
    return to_booking_out(booking)


@router.get("", response_model=list[BookingOut])
def my_bookings(
    db: Session = Depends(get_db), user: User = Depends(current_user)
) -> list[BookingOut]:
    bookings = (
        db.execute(
            select(Booking)
            .options(selectinload(Booking.feedback))
            .where(Booking.user_id == user.id)
            .order_by(Booking.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [to_booking_out(b) for b in bookings]


@router.get("/{booking_id}", response_model=BookingOut)
def get_booking(
    booking_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)
) -> BookingOut:
    return to_booking_out(_load_for_user(db, booking_id, user))


@router.get("/{booking_id}/ticket", response_model=TicketOut)
def get_ticket(
    booking_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)
) -> TicketOut:
    booking = _load_for_user(db, booking_id, user)
    if booking.status == BookingStatus.PENDING.value:
        raise HTTPException(status_code=409, detail="Complete payment to get your ticket")

    holder = db.get(User, booking.user_id)
    return TicketOut(
        booking=to_booking_out(booking),
        qr_data_uri=qr_data_uri(booking.ticket_code),
        holder_name=holder.name if holder else "Guest",
    )


@router.post("/{booking_id}/cancel", response_model=BookingOut)
async def cancel_booking(
    booking_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)
) -> BookingOut:
    booking = _load_for_user(db, booking_id, user)

    if booking.status == BookingStatus.ACTIVE.value:
        raise HTTPException(
            status_code=409,
            detail="Vehicle is already parked -- check out instead of cancelling",
        )
    if booking.status not in (BookingStatus.PENDING.value, BookingStatus.CONFIRMED.value):
        raise HTTPException(
            status_code=409, detail=f"A {booking.status} booking cannot be cancelled"
        )

    booking.status = BookingStatus.CANCELLED.value
    booking.reserved_until = None
    if booking.slot_id:
        set_slot_status(db, booking.slot_id, SlotStatus.VACANT)
    db.commit()
    db.refresh(booking)

    if booking.slot_id:
        await announce_slot(db, booking.slot_id)
    return to_booking_out(booking)


@router.post("/{booking_id}/check-in", response_model=BookingOut)
async def check_in(
    booking_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)
) -> BookingOut:
    booking = _load_for_user(db, booking_id, user)
    if booking.status != BookingStatus.CONFIRMED.value:
        raise HTTPException(
            status_code=409,
            detail=f"Only a confirmed booking can check in (this one is {booking.status})",
        )

    booking.status = BookingStatus.ACTIVE.value
    booking.checked_in_at = datetime.now(timezone.utc)
    booking.reserved_until = None
    if booking.slot_id:
        set_slot_status(db, booking.slot_id, SlotStatus.OCCUPIED)
    db.commit()
    db.refresh(booking)

    if booking.slot_id:
        await announce_slot(db, booking.slot_id)
    return to_booking_out(booking)


@router.post("/{booking_id}/check-out", response_model=BookingOut)
async def check_out(
    booking_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)
) -> BookingOut:
    booking = _load_for_user(db, booking_id, user)
    if booking.status != BookingStatus.ACTIVE.value:
        raise HTTPException(
            status_code=409,
            detail=f"Only a parked vehicle can check out (this one is {booking.status})",
        )

    booking.status = BookingStatus.COMPLETED.value
    booking.checked_out_at = datetime.now(timezone.utc)
    booking.reserved_until = None
    # Releasing the bay here is what makes it bookable again -- the same
    # transition the gate scanner performs in admin.verify_ticket.
    if booking.slot_id:
        set_slot_status(db, booking.slot_id, SlotStatus.VACANT)
    db.commit()
    db.refresh(booking)

    # Broadcast after the commit so every open grid, the lot list and the
    # operator dashboard repaint against the freed bay, not the stale one.
    if booking.slot_id:
        await announce_slot(db, booking.slot_id)
    return to_booking_out(booking)


def _apply_feedback(row: Feedback, payload: FeedbackIn, user: User) -> Feedback:
    """Copy a submitted report onto a Feedback row and re-triage it."""
    row.rating = payload.rating
    row.comment = payload.comment
    row.cleanliness = payload.cleanliness
    row.safety = payload.safety
    row.staff = payload.staff
    row.value = payload.value
    row.issues = join_tags(payload.issues)
    row.highlights = join_tags(payload.highlights)
    row.would_recommend = payload.would_recommend
    row.contact_me = payload.contact_me
    # Fall back to the number already on the account so "call me back" works
    # without retyping it.
    row.contact_phone = payload.contact_phone or (user.phone or "") if payload.contact_me else ""
    row.priority = priority_for(payload.rating, payload.issues)
    return row


def _feedback_booking(db: Session, booking_id: str, user: User) -> Booking:
    booking = _load_for_user(db, booking_id, user)
    if booking.user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the driver can rate this visit")
    if booking.status != BookingStatus.COMPLETED.value:
        raise HTTPException(status_code=409, detail="Rate the visit after you have checked out")
    return booking


@router.get("/{booking_id}/feedback", response_model=FeedbackOut)
def read_feedback(
    booking_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)
) -> FeedbackOut:
    """What the driver already said about this visit, so the form can prefill."""
    booking = _load_for_user(db, booking_id, user)
    if booking.feedback is None:
        raise HTTPException(status_code=404, detail="This visit has not been rated yet")
    return to_feedback_out(booking.feedback)


@router.post(
    "/{booking_id}/feedback", response_model=FeedbackOut, status_code=status.HTTP_201_CREATED
)
def leave_feedback(
    booking_id: str,
    payload: FeedbackIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> FeedbackOut:
    booking = _feedback_booking(db, booking_id, user)
    if booking.feedback is not None:
        raise HTTPException(
            status_code=409,
            detail="This visit already has a rating -- edit it instead",
        )

    row = _apply_feedback(Feedback(booking_id=booking.id), payload, user)
    row.reference_code = new_reference()
    db.add(row)
    db.commit()
    db.refresh(row)
    return to_feedback_out(row)


@router.put("/{booking_id}/feedback", response_model=FeedbackOut)
def update_feedback(
    booking_id: str,
    payload: FeedbackIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> FeedbackOut:
    """Second thoughts are allowed for a day -- after that the report is a record."""
    booking = _feedback_booking(db, booking_id, user)
    row = booking.feedback
    if row is None:
        raise HTTPException(status_code=404, detail="Rate this visit before editing the rating")

    created = as_utc(row.created_at) or datetime.now(timezone.utc)
    if datetime.now(timezone.utc) - created > timedelta(hours=EDIT_WINDOW_HOURS):
        raise HTTPException(
            status_code=409,
            detail=f"Ratings can only be edited within {EDIT_WINDOW_HOURS} hours of sending them",
        )

    _apply_feedback(row, payload, user)
    # A driver who edits a resolved report has something new to say -- put it
    # back in front of the operator.
    if row.status != FeedbackStatus.NEW and row.priority == "high":
        row.status = FeedbackStatus.NEW
    db.commit()
    db.refresh(row)
    return to_feedback_out(row)
