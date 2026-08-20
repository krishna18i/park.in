"""Parking locations and their slot grids."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Booking, LIVE_BOOKING_STATUSES, Location, Slot, SlotStatus, User
from ..realtime import manager
from ..schemas import LocationIn, LocationOut, MessageOut, SlotOut
from ..security import current_admin

router = APIRouter(tags=["locations"])


def build_slots(location: Location) -> list[Slot]:
    """Lay out a rows x cols grid, labelled A1..A8, B1..B8 and so on."""
    return [
        Slot(
            location_id=location.id,
            code=f"{chr(65 + row)}{col + 1}",
            row=row,
            col=col,
            status=SlotStatus.VACANT.value,
        )
        for row in range(location.rows)
        for col in range(location.cols)
    ]


def _counts(db: Session) -> dict[str, tuple[int, int]]:
    """location_id -> (total_slots, vacant_slots), in one grouped query."""
    rows = db.execute(
        select(
            Slot.location_id,
            func.count(Slot.id),
            func.sum(case((Slot.status == SlotStatus.VACANT.value, 1), else_=0)),
        ).group_by(Slot.location_id)
    ).all()
    return {r[0]: (int(r[1] or 0), int(r[2] or 0)) for r in rows}


def _to_out(location: Location, counts: dict[str, tuple[int, int]]) -> LocationOut:
    total, vacant = counts.get(location.id, (0, 0))
    out = LocationOut.model_validate(location)
    out.total_slots = total
    out.available_slots = vacant
    return out


@router.get("/locations", response_model=list[LocationOut])
def list_locations(db: Session = Depends(get_db)) -> list[LocationOut]:
    locations = db.execute(select(Location).order_by(Location.name)).scalars().all()
    counts = _counts(db)
    return [_to_out(loc, counts) for loc in locations]


@router.get("/locations/{location_id}", response_model=LocationOut)
def get_location(location_id: str, db: Session = Depends(get_db)) -> LocationOut:
    location = db.get(Location, location_id)
    if location is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    return _to_out(location, _counts(db))


@router.get("/locations/{location_id}/slots", response_model=list[SlotOut])
def get_slots(location_id: str, db: Session = Depends(get_db)) -> list[SlotOut]:
    if db.get(Location, location_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    slots = (
        db.execute(
            select(Slot).where(Slot.location_id == location_id).order_by(Slot.row, Slot.col)
        )
        .scalars()
        .all()
    )
    return [SlotOut.model_validate(s) for s in slots]


@router.post("/locations", response_model=LocationOut, status_code=status.HTTP_201_CREATED)
async def create_location(
    payload: LocationIn,
    db: Session = Depends(get_db),
    _: User = Depends(current_admin),
) -> LocationOut:
    location = Location(**payload.model_dump())
    db.add(location)
    db.flush()  # assign the id before building slots that reference it
    db.add_all(build_slots(location))
    db.commit()
    db.refresh(location)

    await manager.broadcast("location.created", {"id": location.id, "name": location.name})
    return _to_out(location, _counts(db))


@router.delete("/locations/{location_id}", response_model=MessageOut)
async def delete_location(
    location_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(current_admin),
) -> MessageOut:
    location = db.get(Location, location_id)
    if location is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")

    live = db.execute(
        select(func.count(Booking.id)).where(
            Booking.location_id == location_id,
            Booking.status.in_(LIVE_BOOKING_STATUSES),
        )
    ).scalar_one()
    if live:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{live} booking(s) are still active here. Close them before deleting.",
        )

    name = location.name
    db.delete(location)  # slots cascade; past bookings keep their denormalised copy
    db.commit()

    await manager.broadcast("location.deleted", {"id": location_id})
    return MessageOut(message=f"{name} deleted")
