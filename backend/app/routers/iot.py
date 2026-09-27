"""Authenticated edge-sensor ingestion and the immutable event audit trail."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Booking, BookingStatus, Incident, SensorEvent, Slot, SlotStatus
from ..realtime import manager
from ..schemas import SensorEventIn, SensorEventOut
from ..security import admin_or_sensor_device, current_admin
from ..services import announce_slot, set_slot_status, slot_event

router = APIRouter(prefix="/iot", tags=["iot"])
MIN_APPLY_CONFIDENCE = 0.75


def _out(db: Session, event: SensorEvent) -> SensorEventOut:
    slot = db.get(Slot, event.slot_id)
    return SensorEventOut(
        **{column.name: getattr(event, column.name) for column in SensorEvent.__table__.columns},
        slot_code=slot.code if slot else "",
        location_name=slot.location.name if slot and slot.location else "",
    )


@router.post("/events", response_model=SensorEventOut, status_code=status.HTTP_201_CREATED)
async def ingest_event(
    payload: SensorEventIn,
    db: Session = Depends(get_db),
    _: str = Depends(admin_or_sensor_device),
) -> SensorEventOut:
    slot = db.get(Slot, payload.slot_id)
    if slot is None:
        raise HTTPException(status_code=404, detail="Sensor target bay not found")

    previous = slot.status
    event = SensorEvent(
        device_id=payload.device_id,
        slot_id=slot.id,
        location_id=slot.location_id,
        observed_status=payload.observed_status.value,
        previous_status=previous,
        distance_cm=payload.distance_cm,
        confidence=payload.confidence,
        source=payload.source,
    )
    db.add(event)

    live_booking = db.execute(
        select(Booking)
        .where(
            Booking.slot_id == slot.id,
            Booking.status.in_([
                BookingStatus.PENDING.value,
                BookingStatus.CONFIRMED.value,
                BookingStatus.ACTIVE.value,
            ]),
        )
        .order_by(Booking.created_at.desc())
    ).scalars().first()

    if payload.confidence < MIN_APPLY_CONFIDENCE:
        event.action = "low_confidence_recorded"
    elif payload.observed_status.value == previous:
        event.action = "state_confirmed"
    elif payload.observed_status is SlotStatus.OCCUPIED:
        if live_booking and live_booking.status == BookingStatus.PENDING.value:
            event.action = "payment_pending_review"
        else:
            set_slot_status(db, slot.id, SlotStatus.OCCUPIED)
            event.applied = True
            if live_booking and live_booking.status == BookingStatus.CONFIRMED.value:
                live_booking.status = BookingStatus.ACTIVE.value
                live_booking.checked_in_at = datetime.now(timezone.utc)
                live_booking.reserved_until = None
                event.action = "booking_checked_in"
            else:
                event.action = "unauthorised_presence_detected" if not live_booking else "occupancy_applied"
                if not live_booking:
                    db.add(Incident(
                        location_id=slot.location_id,
                        slot_id=slot.id,
                        category="unauthorised_occupancy",
                        severity="high",
                        description=f"Sensor {payload.device_id} detected an unbooked vehicle in bay {slot.code}.",
                        source="sensor",
                    ))
    else:
        if live_booking and live_booking.status == BookingStatus.CONFIRMED.value:
            event.action = "reserved_bay_still_vacant"
        else:
            set_slot_status(db, slot.id, SlotStatus.VACANT)
            event.applied = True
            if live_booking and live_booking.status == BookingStatus.ACTIVE.value:
                live_booking.status = BookingStatus.COMPLETED.value
                live_booking.checked_out_at = datetime.now(timezone.utc)
                event.action = "booking_checked_out"
            else:
                event.action = "vacancy_applied"

    db.commit()
    db.refresh(event)
    if event.applied:
        await announce_slot(db, slot.id)
    await manager.broadcast("sensor.event", {
        "id": event.id,
        "device_id": event.device_id,
        "slot_id": event.slot_id,
        "location_id": event.location_id,
        "observed_status": event.observed_status,
        "confidence": event.confidence,
        "applied": event.applied,
        "action": event.action,
    })
    return _out(db, event)


@router.get("/events", response_model=list[SensorEventOut])
def recent_events(
    limit: int = Query(default=30, ge=1, le=200),
    db: Session = Depends(get_db),
    _=Depends(current_admin),
) -> list[SensorEventOut]:
    events = db.execute(
        select(SensorEvent).order_by(SensorEvent.received_at.desc()).limit(limit)
    ).scalars().all()
    return [_out(db, event) for event in events]
