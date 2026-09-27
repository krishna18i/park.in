"""Parking locations and their slot grids."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, select, update
from sqlalchemy.orm import Session

from ..database import get_db
from ..geocode import (
    driving_km,
    geocode_address,
    geocode_place,
    haversine_km,
    in_coverage,
    suggest_places,
)
from ..models import Booking, LIVE_BOOKING_STATUSES, Location, Slot, SlotKind, SlotStatus, User
from ..nearby import fetch_nearby
from ..predict import forecast
from ..realtime import manager
from ..schemas import (
    LocationIn,
    LocationLayoutIn,
    LocationOut,
    LocationUpdate,
    LocationValetIn,
    MessageOut,
    NearbyOut,
    OccupancyForecastOut,
    PlaceSuggestionOut,
    NearbyLotOut,
    NearbyLotsOut,
    NearestBayOut,
    SlotLayoutCell,
    SlotOut,
    _layout_covers_grid,
)
from ..security import current_admin

router = APIRouter(tags=["locations"])


def bay_kind(kind: str | SlotKind) -> str:
    """Valet is a booking add-on, not a bay type — treat leftover valet cells as cars."""
    value = kind.value if isinstance(kind, SlotKind) else kind
    if value == SlotKind.VALET.value:
        return SlotKind.STANDARD.value
    return value


def slot_kind_for(row: int, col: int, rows: int, cols: int) -> str:
    """EV along the first column, truck lanes on the last row, cars everywhere else."""
    if row == rows - 1:
        return SlotKind.HEAVY.value
    if col == 0:
        return SlotKind.EV.value
    return SlotKind.STANDARD.value


def kind_map_from_layout(cells: list[SlotLayoutCell] | None) -> dict[tuple[int, int], str] | None:
    if not cells:
        return None
    return {(cell.row, cell.col): bay_kind(cell.kind) for cell in cells}


def build_slots(
    location: Location, kind_map: dict[tuple[int, int], str] | None = None
) -> list[Slot]:
    """Lay out a rows x cols grid, labelled A1..A8, B1..B8 and so on."""
    return [
        Slot(
            location_id=location.id,
            code=f"{chr(65 + row)}{col + 1}",
            row=row,
            col=col,
            status=SlotStatus.VACANT.value,
            kind=(
                kind_map.get((row, col), SlotKind.STANDARD.value)
                if kind_map is not None
                else slot_kind_for(row, col, location.rows, location.cols)
            ),
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


def _norm(text: str) -> str:
    return " ".join(text.lower().split())


def _exact_lot_destination(
    query: str, locations: list[Location]
) -> tuple[float, float, str] | None:
    """Only when the driver typed a registered lot name, not a nearby street."""
    needle = _norm(query)
    if not needle:
        return None
    for location in locations:
        if location.latitude is None or location.longitude is None:
            continue
        if _norm(location.name) == needle:
            return location.latitude, location.longitude, location.name
    return None


def _resolve_destination(
    query: str,
    locations: list[Location],
    lat: float | None,
    lng: float | None,
) -> tuple[float, float, str]:
    if lat is not None and lng is not None:
        return lat, lng, query.strip()

    exact = _exact_lot_destination(query, locations)
    if exact:
        return exact

    dest_lat, dest_lng, label = geocode_place(query)
    if dest_lat is None or dest_lng is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Could not find that place. Try a landmark, area, or full address.",
        )
    if not in_coverage(dest_lat, dest_lng):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="That destination is outside Park.in coverage in Jaipur.",
        )
    return dest_lat, dest_lng, label or query.strip()


def _rank_open_lots(
    dest_lat: float,
    dest_lng: float,
    locations: list[Location],
    counts: dict[str, tuple[int, int]],
    radius_km: float | None = None,
) -> tuple[list[tuple[Location, float]], bool]:
    """Lots with a free bay, closest first (road distance when OSRM answers).

    radius_km is a straight-line circle around the destination. Displayed
    distance can still be driving distance inside that circle.
    """
    candidates: list[tuple[Location, float]] = []
    for location in locations:
        vacant = counts.get(location.id, (0, 0))[1]
        if vacant <= 0 or location.latitude is None or location.longitude is None:
            continue
        straight = haversine_km(dest_lat, dest_lng, location.latitude, location.longitude)
        if radius_km is not None and straight > radius_km:
            continue
        candidates.append((location, straight))
    if not candidates:
        return [], False

    road = driving_km(
        dest_lat, dest_lng, [(loc.latitude, loc.longitude) for loc, _ in candidates]
    )
    scored: list[tuple[Location, float]] = []
    used_driving = bool(road) and any(value is not None for value in (road or []))
    if used_driving and road is not None:
        for (location, straight), drive in zip(candidates, road):
            scored.append((location, drive if drive is not None else straight))
    else:
        used_driving = False
        scored = candidates

    scored.sort(key=lambda item: item[1])
    return scored, used_driving


SEARCH_RADIUS_KM = 2.0
SEARCH_MAX_LOTS = 5


def _compatible_vacancies(db: Session, location_ids: list[str], kind: str) -> dict[str, int]:
    if not location_ids:
        return {}
    rows = db.execute(
        select(Slot.location_id, func.count(Slot.id))
        .where(
            Slot.location_id.in_(location_ids),
            Slot.status == SlotStatus.VACANT.value,
            Slot.kind == kind,
        )
        .group_by(Slot.location_id)
    ).all()
    return {location_id: int(count) for location_id, count in rows}


def _park_score_rows(
    db: Session,
    nearby: list[tuple[Location, float]],
    counts: dict[str, tuple[int, int]],
    vehicle_kind: str,
) -> list[dict]:
    """Rank nearby capacity with an explainable 0-100 score.

    Distance matters most, but a slightly farther lot can win when it has much
    healthier live/predicted capacity or a better price. Every factor returned
    here is displayed to the driver instead of hiding the decision in a black box.
    """
    compatible = _compatible_vacancies(db, [location.id for location, _ in nearby], vehicle_kind)
    prices = [location.price_per_hour for location, _ in nearby] or [0]
    low_price, high_price = min(prices), max(prices)
    rows = []
    for location, distance in nearby:
        total, vacant = counts.get(location.id, (0, 0))
        prediction = forecast(location.id, hours=1)["hours"][0]["occupancy_pct"]
        distance_factor = max(0.0, 100.0 - min(distance, SEARCH_RADIUS_KM) / SEARCH_RADIUS_KM * 100.0)
        availability_factor = 100.0 * vacant / total if total else 0.0
        prediction_factor = max(0.0, 100.0 - prediction)
        price_factor = 100.0 if high_price == low_price else 100.0 * (high_price - location.price_per_hour) / (high_price - low_price)
        compatible_count = compatible.get(location.id, 0)
        compatibility_factor = min(100.0, 60.0 + compatible_count * 10.0) if compatible_count else 0.0
        factors = {
            "distance": round(distance_factor, 1),
            "availability": round(availability_factor, 1),
            "prediction": round(prediction_factor, 1),
            "price": round(price_factor, 1),
            "compatibility": round(compatibility_factor, 1),
        }
        score = (
            factors["distance"] * 0.30
            + factors["availability"] * 0.25
            + factors["prediction"] * 0.20
            + factors["price"] * 0.15
            + factors["compatibility"] * 0.10
        )
        reasons = []
        if distance <= 0.6:
            reasons.append("Closest to your destination")
        if availability_factor >= 45:
            reasons.append("Strong live availability")
        if prediction <= 55:
            reasons.append("Lower predicted pressure")
        if location.price_per_hour == low_price:
            reasons.append("Best price nearby")
        if compatible_count:
            reasons.append(f"{compatible_count} compatible bays free")
        rows.append({
            "location": location,
            "distance": distance,
            "score": round(score, 1),
            "prediction": round(prediction, 1),
            "compatible": compatible_count,
            "factors": factors,
            "reasons": reasons[:3],
        })
    rows.sort(key=lambda row: (-row["score"], row["distance"]))
    return rows


def _pick_nearest_open_lot(
    dest_lat: float, dest_lng: float, locations: list[Location], counts: dict[str, tuple[int, int]]
) -> tuple[Location, float, bool]:
    ranked, used_driving = _rank_open_lots(dest_lat, dest_lng, locations, counts)
    if not ranked:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No bays are free right now. Try another destination in a moment.",
        )
    location, distance = ranked[0]
    return location, distance, used_driving


@router.get("/locations", response_model=list[LocationOut])
def list_locations(db: Session = Depends(get_db)) -> list[LocationOut]:
    locations = db.execute(select(Location).order_by(Location.name)).scalars().all()
    counts = _counts(db)
    return [_to_out(loc, counts) for loc in locations]


@router.get("/locations/places", response_model=list[PlaceSuggestionOut])
def place_suggestions(q: str = Query(..., min_length=2, max_length=200)) -> list[PlaceSuggestionOut]:
    """Map autocomplete for the destination the driver is actually going to."""
    return [PlaceSuggestionOut.model_validate(place) for place in suggest_places(q)]


@router.get("/locations/nearest", response_model=NearestBayOut)
def nearest_available_bay(
    q: str = Query(..., min_length=2, max_length=200),
    lat: float | None = Query(default=None, ge=-90, le=90),
    lng: float | None = Query(default=None, ge=-180, le=180),
    db: Session = Depends(get_db),
) -> NearestBayOut:
    """Geocode the destination, then pick the closest registered lot with a free bay."""
    locations = db.execute(select(Location)).scalars().all()
    counts = _counts(db)
    dest_lat, dest_lng, dest_label = _resolve_destination(q, locations, lat, lng)
    location, distance, used_driving = _pick_nearest_open_lot(dest_lat, dest_lng, locations, counts)
    return NearestBayOut(
        location=_to_out(location, counts),
        distance_km=round(distance, 2),
        destination=dest_label,
        destination_latitude=round(dest_lat, 6),
        destination_longitude=round(dest_lng, 6),
        driving=used_driving,
    )


@router.get("/locations/nearby-bays", response_model=NearbyLotsOut)
def nearby_open_bays(
    q: str = Query(..., min_length=2, max_length=200),
    lat: float | None = Query(default=None, ge=-90, le=90),
    lng: float | None = Query(default=None, ge=-180, le=180),
    vehicle_kind: SlotKind = Query(default=SlotKind.STANDARD),
    db: Session = Depends(get_db),
) -> NearbyLotsOut:
    """Up to five registered lots with a free bay inside 2 km of the destination."""
    locations = db.execute(select(Location)).scalars().all()
    counts = _counts(db)
    dest_lat, dest_lng, dest_label = _resolve_destination(q, locations, lat, lng)
    ranked, used_driving = _rank_open_lots(
        dest_lat, dest_lng, locations, counts, radius_km=SEARCH_RADIUS_KM
    )
    nearby = ranked[:SEARCH_MAX_LOTS]
    requested_kind = bay_kind(vehicle_kind)
    scored = _park_score_rows(db, nearby, counts, requested_kind)
    return NearbyLotsOut(
        destination=dest_label,
        destination_latitude=round(dest_lat, 6),
        destination_longitude=round(dest_lng, 6),
        driving=used_driving,
        lots=[
            NearbyLotOut(
                location=_to_out(row["location"], counts),
                distance_km=round(row["distance"], 2),
                rank=index + 1,
                park_score=row["score"],
                predicted_occupancy=row["prediction"],
                compatible_bays=row["compatible"],
                factors=row["factors"],
                reasons=row["reasons"],
            )
            for index, row in enumerate(scored)
        ],
    )


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


@router.get("/locations/{location_id}/nearby", response_model=NearbyOut)
def nearby_amenities(location_id: str, db: Session = Depends(get_db)) -> NearbyOut:
    location = db.get(Location, location_id)
    if location is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    lot = {
        "id": location.id,
        "name": location.name,
        "latitude": location.latitude,
        "longitude": location.longitude,
    }
    if location.latitude is None or location.longitude is None:
        return NearbyOut(available=False, amenities=[], lot=lot)
    result = fetch_nearby(location.latitude, location.longitude)
    return NearbyOut(available=result["available"], amenities=result["amenities"], lot=lot)


@router.get("/locations/{location_id}/predict-occupancy", response_model=OccupancyForecastOut)
def predict_occupancy(location_id: str, db: Session = Depends(get_db)) -> OccupancyForecastOut:
    if db.get(Location, location_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    payload = forecast(location_id)
    return OccupancyForecastOut.model_validate(payload)


@router.post("/locations", response_model=LocationOut, status_code=status.HTTP_201_CREATED)
async def create_location(
    payload: LocationIn,
    db: Session = Depends(get_db),
    _: User = Depends(current_admin),
) -> LocationOut:
    data = payload.model_dump(exclude={"slot_layout"})
    if data.get("latitude") is None or data.get("longitude") is None:
        lat, lng = geocode_address(data["address"])
        data["latitude"] = data.get("latitude") if data.get("latitude") is not None else lat
        data["longitude"] = data.get("longitude") if data.get("longitude") is not None else lng
    location = Location(**data)
    db.add(location)
    db.flush()  # assign the id before building slots that reference it
    db.add_all(build_slots(location, kind_map_from_layout(payload.slot_layout)))
    db.commit()
    db.refresh(location)

    await manager.broadcast("location.created", {"id": location.id, "name": location.name})
    return _to_out(location, _counts(db))


@router.patch("/locations/{location_id}", response_model=LocationOut)
async def update_location(
    location_id: str,
    payload: LocationUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(current_admin),
) -> LocationOut:
    location = db.get(Location, location_id)
    if location is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")

    data = payload.model_dump(exclude_unset=True)
    previous_name = location.name
    previous_address = location.address
    for field, value in data.items():
        setattr(location, field, value)

    coords_in_payload = "latitude" in data or "longitude" in data
    if location.address != previous_address and not coords_in_payload:
        lat, lng = geocode_address(location.address)
        if lat is not None and lng is not None:
            location.latitude, location.longitude = lat, lng

    if location.name != previous_name:
        db.execute(
            update(Booking)
            .where(
                Booking.location_id == location_id,
                Booking.status.in_(LIVE_BOOKING_STATUSES),
            )
            .values(location_name=location.name)
        )

    db.commit()
    db.refresh(location)
    out = _to_out(location, _counts(db))
    await manager.broadcast("location.updated", out.model_dump(mode="json"))
    return out


@router.patch("/locations/{location_id}/valet", response_model=LocationOut)
async def update_valet(
    location_id: str,
    payload: LocationValetIn,
    db: Session = Depends(get_db),
    _: User = Depends(current_admin),
) -> LocationOut:
    location = db.get(Location, location_id)
    if location is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    location.valet_enabled = payload.valet_enabled
    location.valet_price_per_hour = payload.valet_price_per_hour
    db.commit()
    db.refresh(location)
    await manager.broadcast(
        "location.updated",
        {
            "id": location.id,
            "valet_enabled": location.valet_enabled,
            "valet_price_per_hour": location.valet_price_per_hour,
        },
    )
    return _to_out(location, _counts(db))


@router.patch("/locations/{location_id}/layout", response_model=list[SlotOut])
async def update_layout(
    location_id: str,
    payload: LocationLayoutIn,
    db: Session = Depends(get_db),
    _: User = Depends(current_admin),
) -> list[SlotOut]:
    """Operator redraws which bays are car, EV, or truck."""
    location = db.get(Location, location_id)
    if location is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    try:
        _layout_covers_grid(location.rows, location.cols, payload.slots)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    kinds = kind_map_from_layout(payload.slots) or {}
    slots = (
        db.execute(select(Slot).where(Slot.location_id == location_id).order_by(Slot.row, Slot.col))
        .scalars()
        .all()
    )
    for slot in slots:
        slot.kind = kinds.get((slot.row, slot.col), SlotKind.STANDARD.value)
    db.commit()

    await manager.broadcast("location.updated", {"id": location.id, "layout": True})
    return [SlotOut.model_validate(slot) for slot in slots]


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
