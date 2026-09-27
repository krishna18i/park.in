"""Operator-side endpoints: live stats, every booking, manual slot override,
and the gate scanner that turns a ticket code into a check-in or check-out."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..config import DEMO_RESET_ENABLED
from ..database import get_db
from ..models import (
    Booking,
    BookingStatus,
    Location,
    Payment,
    PaymentStatus,
    Slot,
    SlotStatus,
    User,
)
from ..schemas import BookingOut, SlotOut, SlotStatusIn, StatsOut, TicketActionOut, VerifyTicketIn, to_booking_out
from ..security import current_admin
from ..seed import reset_demo
from ..predict import fit_all
from ..realtime import manager
from ..services import announce_slot, set_slot_status

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/reset-demo")
async def reset_demo_scenario(
    db: Session = Depends(get_db),
    _: User = Depends(current_admin),
) -> dict:
    """Restore the fixed judging dataset; disabled with DEMO_RESET_ENABLED=false."""
    if not DEMO_RESET_ENABLED:
        raise HTTPException(status_code=403, detail="Demo reset is disabled")
    reset_demo(db)
    fit_all(db)
    await manager.broadcast("demo.reset", {"message": "Presentation scenario restored"})
    return {"message": "Presentation scenario restored", "credentials_preserved": True}


@router.get("/stats", response_model=StatsOut)
def stats(db: Session = Depends(get_db), _: User = Depends(current_admin)) -> StatsOut:
    slot_counts = dict(
        db.execute(select(Slot.status, func.count(Slot.id)).group_by(Slot.status)).all()
    )
    occupied = int(slot_counts.get(SlotStatus.OCCUPIED.value, 0))
    reserved = int(slot_counts.get(SlotStatus.RESERVED.value, 0))
    vacant = int(slot_counts.get(SlotStatus.VACANT.value, 0))
    total_slots = occupied + reserved + vacant

    midnight = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    def _revenue(since: datetime | None = None) -> float:
        stmt = select(func.coalesce(func.sum(Payment.amount), 0.0)).where(
            Payment.status == PaymentStatus.SUCCESS.value
        )
        if since is not None:
            stmt = stmt.where(Payment.created_at >= since)
        return float(db.execute(stmt).scalar_one())

    active = db.execute(
        select(func.count(Booking.id)).where(Booking.status == BookingStatus.ACTIVE.value)
    ).scalar_one()

    return StatsOut(
        total_locations=db.execute(select(func.count(Location.id))).scalar_one(),
        total_slots=total_slots,
        occupied_slots=occupied,
        reserved_slots=reserved,
        vacant_slots=vacant,
        occupancy_rate=round((occupied + reserved) / total_slots * 100, 1) if total_slots else 0.0,
        total_bookings=db.execute(select(func.count(Booking.id))).scalar_one(),
        active_bookings=int(active),
        total_revenue=round(_revenue(), 2),
        revenue_today=round(_revenue(midnight), 2),
    )


@router.get("/bookings", response_model=list[BookingOut])
def all_bookings(
    db: Session = Depends(get_db),
    _: User = Depends(current_admin),
    status_filter: BookingStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=200, ge=1, le=1000),
) -> list[BookingOut]:
    stmt = select(Booking).options(selectinload(Booking.feedback)).order_by(Booking.created_at.desc()).limit(limit)
    if status_filter is not None:
        stmt = stmt.where(Booking.status == status_filter.value)
    return [to_booking_out(b) for b in db.execute(stmt).scalars().all()]


@router.patch("/slots/{slot_id}", response_model=SlotOut)
async def override_slot(
    slot_id: str,
    payload: SlotStatusIn,
    db: Session = Depends(get_db),
    _: User = Depends(current_admin),
) -> SlotOut:
    """Manual override for the operator -- blocking a bay for maintenance, or
    clearing one a driver left without checking out."""
    if db.get(Slot, slot_id) is None:
        raise HTTPException(status_code=404, detail="Slot not found")

    set_slot_status(db, slot_id, payload.status)
    db.commit()
    await announce_slot(db, slot_id)
    return SlotOut.model_validate(db.get(Slot, slot_id))


@router.post("/verify-ticket", response_model=TicketActionOut)
async def verify_ticket(
    payload: VerifyTicketIn,
    db: Session = Depends(get_db),
    _: User = Depends(current_admin),
) -> TicketActionOut:
    """The gate scanner. One endpoint handles both directions:
    a confirmed ticket checks in, a parked one checks out."""
    booking = db.execute(
        select(Booking).where(Booking.ticket_code == payload.code)
    ).scalar_one_or_none()
    if booking is None:
        raise HTTPException(status_code=404, detail=f"No ticket matches {payload.code}")

    now = datetime.now(timezone.utc)

    if booking.status == BookingStatus.CONFIRMED.value:
        booking.status = BookingStatus.ACTIVE.value
        booking.checked_in_at = now
        booking.reserved_until = None
        if booking.slot_id:
            set_slot_status(db, booking.slot_id, SlotStatus.OCCUPIED)
        action, message = "checked_in", f"Welcome. Slot {booking.slot_code} is yours."

    elif booking.status == BookingStatus.ACTIVE.value:
        booking.status = BookingStatus.COMPLETED.value
        booking.checked_out_at = now
        if booking.slot_id:
            set_slot_status(db, booking.slot_id, SlotStatus.VACANT)
        action, message = "checked_out", f"Checked out. Slot {booking.slot_code} released."

    else:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ticket {payload.code} is {booking.status} and cannot be scanned",
        )

    db.commit()
    db.refresh(booking)

    if booking.slot_id:
        await announce_slot(db, booking.slot_id)

    return TicketActionOut(
        action=action, message=message, booking=to_booking_out(booking)
    )
