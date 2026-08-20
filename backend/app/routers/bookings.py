"""Booking lifecycle: reserve, cancel, check in, check out, and the QR ticket."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Booking, BookingStatus, Location, Role, Slot, SlotStatus, User
from ..qr import qr_data_uri
from ..schemas import BookingIn, BookingOut, TicketOut
from ..security import current_user
from ..services import announce_slot, claim_slot, hold_deadline, price_booking, set_slot_status
from ..utils import new_ticket_code

router = APIRouter(prefix="/bookings", tags=["bookings"])

MAX_STAY_HOURS = 24
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

    slot = db.get(Slot, payload.slot_id)
    if slot is None:
        raise HTTPException(status_code=404, detail="Slot not found")

    location = db.get(Location, slot.location_id)
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")

    # Atomic claim -- if someone else took this slot a moment ago this fails
    # cleanly instead of double-booking it.
    if not claim_slot(db, slot.id):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Slot {slot.code} was just taken. Pick another one.",
        )

    hours, amount = price_booking(location, payload.start_time, payload.end_time)
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
        status=BookingStatus.PENDING.value,
        ticket_code=new_ticket_code(),
        reserved_until=hold_deadline(),
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    await announce_slot(db, slot.id)
    return BookingOut.model_validate(booking)


@router.get("", response_model=list[BookingOut])
def my_bookings(
    db: Session = Depends(get_db), user: User = Depends(current_user)
) -> list[BookingOut]:
    bookings = (
        db.execute(
            select(Booking).where(Booking.user_id == user.id).order_by(Booking.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [BookingOut.model_validate(b) for b in bookings]


@router.get("/{booking_id}", response_model=BookingOut)
def get_booking(
    booking_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)
) -> BookingOut:
    return BookingOut.model_validate(_load_for_user(db, booking_id, user))


@router.get("/{booking_id}/ticket", response_model=TicketOut)
def get_ticket(
    booking_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)
) -> TicketOut:
    booking = _load_for_user(db, booking_id, user)
    if booking.status == BookingStatus.PENDING.value:
        raise HTTPException(status_code=409, detail="Complete payment to get your ticket")

    holder = db.get(User, booking.user_id)
    return TicketOut(
        booking=BookingOut.model_validate(booking),
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
    return BookingOut.model_validate(booking)


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
    return BookingOut.model_validate(booking)


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
    if booking.slot_id:
        set_slot_status(db, booking.slot_id, SlotStatus.VACANT)
    db.commit()
    db.refresh(booking)

    if booking.slot_id:
        await announce_slot(db, booking.slot_id)
    return BookingOut.model_validate(booking)
