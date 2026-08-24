"""Payment capture.

Without Razorpay keys this stays simulated so a laptop demo needs no merchant
account. Drop `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` into `.env` and UPI/card
checkout switches to the live gateway; cash always stays local.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..config import RAZORPAY_ENABLED, RAZORPAY_KEY_ID
from ..database import get_db
from ..models import Booking, BookingStatus, Payment, PaymentMethod, PaymentStatus, User
from ..razorpay_client import create_order, verify_signature
from ..realtime import manager
from ..schemas import PaymentConfigOut, PaymentIn, PaymentOrderOut, PaymentOut
from ..security import current_user
from ..utils import as_utc, new_reference

router = APIRouter(prefix="/payments", tags=["payments"])


def _authorise(method: PaymentMethod) -> tuple[bool, str]:
    """Local stand-in used when Razorpay is not configured, or for cash at the gate."""
    return True, new_reference(method.value)


def _pending_booking(db: Session, booking_id: str, user: User) -> Booking:
    booking = db.get(Booking, booking_id)
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

    deadline = as_utc(booking.reserved_until)
    if deadline is not None and deadline < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=409, detail="This reservation expired and the slot was released"
        )
    return booking


@router.get("/config", response_model=PaymentConfigOut)
def payment_config() -> PaymentConfigOut:
    if RAZORPAY_ENABLED:
        return PaymentConfigOut(provider="razorpay", key_id=RAZORPAY_KEY_ID)
    return PaymentConfigOut(provider="simulated")


@router.post("/order", response_model=PaymentOrderOut)
def payment_order(
    payload: PaymentIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> PaymentOrderOut:
    booking = _pending_booking(db, payload.booking_id, user)
    if payload.method is PaymentMethod.CASH or not RAZORPAY_ENABLED:
        return PaymentOrderOut(provider="simulated", amount=booking.amount)

    try:
        order = create_order(amount_rupees=booking.amount, receipt=booking.id)
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return PaymentOrderOut(
        provider="razorpay",
        order_id=order["id"],
        amount=booking.amount,
        key_id=RAZORPAY_KEY_ID,
    )


@router.post("", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
async def pay(
    payload: PaymentIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> PaymentOut:
    booking = _pending_booking(db, payload.booking_id, user)

    use_razorpay = (
        RAZORPAY_ENABLED
        and payload.method is not PaymentMethod.CASH
        and payload.razorpay_payment_id
    )
    if use_razorpay:
        if not (
            payload.razorpay_order_id
            and payload.razorpay_payment_id
            and payload.razorpay_signature
        ):
            raise HTTPException(status_code=400, detail="Razorpay payment details are missing")
        ok = verify_signature(
            payload.razorpay_order_id,
            payload.razorpay_payment_id,
            payload.razorpay_signature,
        )
        reference = payload.razorpay_payment_id
        if not ok:
            payment = Payment(
                booking_id=booking.id,
                amount=booking.amount,
                method=payload.method.value,
                status=PaymentStatus.FAILED.value,
                reference=reference,
            )
            db.add(payment)
            db.commit()
            raise HTTPException(status_code=402, detail="Payment signature could not be verified.")
    else:
        if RAZORPAY_ENABLED and payload.method is not PaymentMethod.CASH:
            raise HTTPException(
                status_code=400,
                detail="Complete Razorpay checkout before confirming this payment",
            )
        ok, reference = _authorise(payload.method)

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
    booking.reserved_until = None
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
