"""Authority controls for temporary curb allocation and incident response."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import DynamicAllocation, Incident, Location, Slot, SlotStatus, User
from ..schemas import AllocationIn, AllocationOut, IncidentIn, IncidentOut
from ..security import current_admin
from ..services import announce_slot

router = APIRouter(prefix="/governance", tags=["governance"])


def allocation_out(db: Session, row: DynamicAllocation) -> AllocationOut:
    slot = db.get(Slot, row.slot_id)
    location = db.get(Location, row.location_id)
    return AllocationOut.model_validate(row).model_copy(update={
        "slot_code": slot.code if slot else "",
        "location_name": location.name if location else "",
    })


def incident_out(db: Session, row: Incident) -> IncidentOut:
    slot = db.get(Slot, row.slot_id) if row.slot_id else None
    location = db.get(Location, row.location_id)
    return IncidentOut.model_validate(row).model_copy(update={
        "slot_code": slot.code if slot else "",
        "location_name": location.name if location else "",
    })


@router.post("/allocations", response_model=AllocationOut, status_code=status.HTTP_201_CREATED)
async def create_allocation(
    payload: AllocationIn,
    db: Session = Depends(get_db),
    admin: User = Depends(current_admin),
) -> AllocationOut:
    slot = db.get(Slot, payload.slot_id)
    if slot is None:
        raise HTTPException(status_code=404, detail="Bay not found")
    if slot.status != SlotStatus.VACANT.value:
        raise HTTPException(status_code=409, detail="Only a vacant bay can be reallocated")
    active = db.execute(
        select(DynamicAllocation).where(
            DynamicAllocation.slot_id == slot.id,
            DynamicAllocation.status == "active",
        )
    ).scalar_one_or_none()
    if active:
        raise HTTPException(status_code=409, detail="This bay already has an active allocation")
    if slot.kind == payload.allocated_kind.value:
        raise HTTPException(status_code=400, detail="Bay already has that allocation type")

    row = DynamicAllocation(
        slot_id=slot.id,
        location_id=slot.location_id,
        previous_kind=slot.kind,
        allocated_kind=payload.allocated_kind.value,
        reason=payload.reason.strip(),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=payload.duration_minutes),
        created_by=admin.id,
    )
    slot.kind = payload.allocated_kind.value
    db.add(row)
    db.commit()
    db.refresh(row)
    await announce_slot(db, slot.id)
    return allocation_out(db, row)


@router.get("/allocations", response_model=list[AllocationOut])
def list_allocations(
    active_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    _: User = Depends(current_admin),
) -> list[AllocationOut]:
    query = select(DynamicAllocation).order_by(DynamicAllocation.starts_at.desc())
    if active_only:
        query = query.where(DynamicAllocation.status == "active")
    return [allocation_out(db, row) for row in db.execute(query.limit(100)).scalars().all()]


@router.post("/allocations/{allocation_id}/revert", response_model=AllocationOut)
async def revert_allocation(
    allocation_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(current_admin),
) -> AllocationOut:
    row = db.get(DynamicAllocation, allocation_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Allocation not found")
    if row.status != "active":
        raise HTTPException(status_code=409, detail="Allocation is already closed")
    slot = db.get(Slot, row.slot_id)
    if slot is None:
        raise HTTPException(status_code=404, detail="Allocated bay no longer exists")
    if slot.status != SlotStatus.VACANT.value:
        raise HTTPException(status_code=409, detail="Allocation cannot be reverted while the bay is in use")
    slot.kind = row.previous_kind
    row.status = "reverted"
    row.reverted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    await announce_slot(db, slot.id)
    return allocation_out(db, row)


@router.post("/incidents", response_model=IncidentOut, status_code=status.HTTP_201_CREATED)
def create_incident(
    payload: IncidentIn,
    db: Session = Depends(get_db),
    _: User = Depends(current_admin),
) -> IncidentOut:
    if db.get(Location, payload.location_id) is None:
        raise HTTPException(status_code=404, detail="Location not found")
    if payload.slot_id:
        slot = db.get(Slot, payload.slot_id)
        if slot is None or slot.location_id != payload.location_id:
            raise HTTPException(status_code=400, detail="Bay does not belong to that location")
    row = Incident(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return incident_out(db, row)


@router.get("/incidents", response_model=list[IncidentOut])
def list_incidents(
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    _: User = Depends(current_admin),
) -> list[IncidentOut]:
    query = select(Incident).order_by(Incident.created_at.desc())
    if status_filter:
        query = query.where(Incident.status == status_filter)
    return [incident_out(db, row) for row in db.execute(query.limit(200)).scalars().all()]


@router.post("/incidents/{incident_id}/resolve", response_model=IncidentOut)
def resolve_incident(
    incident_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(current_admin),
) -> IncidentOut:
    row = db.get(Incident, incident_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    row.status = "resolved"
    row.resolved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return incident_out(db, row)
