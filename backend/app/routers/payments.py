"""Payment capture.

This is a *simulated* gateway: it records a payment and advances the booking,
but talks to no third party. That keeps the prototype runnable with no API keys
and no network. `_authorise()` is the single seam where a real provider
(Razorpay, Stripe) would be called instead.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Booking, BookingStatus, Payment, PaymentMethod, PaymentStatus, User
from ..realtime import manager
from ..schemas import PaymentIn, PaymentOut
from ..security import current_user
from ..utils import as_utc, new_reference

router = APIRouter(prefix="/payments", tags=["payments"])


def _authorise(method: PaymentMethod, amount: float) -> tuple[bool, str]:
    """Stand-in for a payment provider call. Always authorises.

    Replace the body with a real gateway call; everything downstream already
    handles a False result by leaving the booking unpaid.
    """
    return True, new_reference(method.value)


@router.post("", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
async def pay(
    payload: PaymentIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> PaymentOut:
    booking = db.get(Booking, payload.booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.user_id != user.id:
        raise HTTPException(status_code=403, detail="That booking belongs to someone else")

    if booking.status == BookingStatus.EXPIRED.value:
        raise HTTPException(
            status_code=409, detail="This reservation expired and the slot was released"
        )
    if booking.status != BookingStatus.PENDING.value:
        raise HTTPException(status_code=409, detail=f"Booking is already {booking.status}")

    # The sweeper runs on a timer, so a booking can be past its hold window but
    # not yet swept. Check the deadline here too rather than taking the money.
    deadline = as_utc(booking.reserved_until)
    if deadline is not None and deadline < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=409, detail="This reservation expired and the slot was released"
        )

    ok, reference = _authorise(payload.method, booking.amount)

    payment = Payment(
        booking_id=booking.id,
        amount=booking.amount,
        method=payload.method.value,
        status=PaymentStatus.SUCCESS.value if ok else PaymentStatus.FAILED.value,
        reference=reference,
    )
    db.add(payment)

    if not ok:
        db.commit()
        raise HTTPException(status_code=402, detail="Payment was declined. Try another method.")

    booking.status = BookingStatus.CONFIRMED.value
    booking.reserved_until = None  # paid bookings no longer expire
    db.commit()
    db.refresh(payment)
    db.refresh(booking)

    await manager.broadcast(
        "booking.confirmed",
        {"id": booking.id, "slot_id": booking.slot_id, "ticket_code": booking.ticket_code},
    )
    return PaymentOut.model_validate(payment)


@router.get("/booking/{booking_id}", response_model=list[PaymentOut])
def payments_for_booking(
    booking_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)
) -> list[PaymentOut]:
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="That booking belongs to someone else")
    return [PaymentOut.model_validate(p) for p in booking.payments]


