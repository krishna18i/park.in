"""Hourly occupancy forecast from historical bookings.

Fits a small scikit-learn model (hour + weekday -> occupancy %) once at
startup. If sklearn/pandas is missing or a lot has too little history, a
weekday-hour average is used instead. Nothing leaves the laptop.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Booking, Location, Slot

logger = logging.getLogger(__name__)

# location_id -> { "kind": "sklearn"|"average", "predict": callable, "hint": str }
_MODELS: dict[str, dict[str, Any]] = {}


def _band(pct: float) -> str:
    if pct < 40:
        return "quiet"
    if pct < 70:
        return "busy"
    return "peak"


def _slot_counts(db: Session) -> dict[str, int]:
    rows = db.execute(select(Slot.location_id, Slot.id)).all()
    counts: dict[str, int] = defaultdict(int)
    for location_id, _slot_id in rows:
        counts[location_id] += 1
    return dict(counts)


def _samples(db: Session, location_id: str, total_slots: int) -> list[tuple[int, int, float]]:
    """(weekday, hour, occupancy_pct) from the last two weeks of bookings."""
    if total_slots <= 0:
        return []

    bookings = (
        db.execute(select(Booking).where(Booking.location_id == location_id))
        .scalars()
        .all()
    )
    if not bookings:
        return []

    now = datetime.now(timezone.utc)
    start_window = now - timedelta(days=14)
    occupied: dict[tuple[int, int], set[str]] = defaultdict(set)

    for booking in bookings:
        start = booking.start_time
        end = booking.end_time
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        if end < start_window:
            continue
        cursor = start.replace(minute=0, second=0, microsecond=0)
        while cursor < end and cursor < now + timedelta(hours=1):
            if cursor >= start_window:
                occupied[(cursor.weekday(), cursor.hour)].add(booking.id)
            cursor += timedelta(hours=1)

    samples = []
    for (weekday, hour), ids in occupied.items():
        pct = min(100.0, round(100.0 * len(ids) / total_slots, 1))
        samples.append((weekday, hour, pct))
    return samples


def _fit_sklearn(samples: list[tuple[int, int, float]]):
    try:
        import pandas as pd
        from sklearn.ensemble import RandomForestRegressor
    except ImportError:
        return None

    frame = pd.DataFrame(samples, columns=["weekday", "hour", "pct"])
    if len(frame) < 8:
        return None
    model = RandomForestRegressor(
        n_estimators=40, max_depth=6, random_state=20260820, min_samples_leaf=1
    )
    model.fit(frame[["weekday", "hour"]], frame["pct"])
    return model


def _averages(samples: list[tuple[int, int, float]]) -> dict[tuple[int, int], float]:
    buckets: dict[tuple[int, int], list[float]] = defaultdict(list)
    hour_only: dict[int, list[float]] = defaultdict(list)
    for weekday, hour, pct in samples:
        buckets[(weekday, hour)].append(pct)
        hour_only[hour].append(pct)
    means = {key: sum(vals) / len(vals) for key, vals in buckets.items()}
    hour_means = {hour: sum(vals) / len(vals) for hour, vals in hour_only.items()}
    return {"cell": means, "hour": hour_means}


def _heuristic(weekday: int, hour: int) -> float:
    """Jaipur tourist-lot shape used when a site has almost no history."""
    del weekday
    if 10 <= hour <= 13 or 16 <= hour <= 19:
        return 72.0
    if 8 <= hour <= 21:
        return 48.0
    return 18.0


def fit_all(db: Session) -> None:
    counts = _slot_counts(db)
    locations = db.execute(select(Location)).scalars().all()
    _MODELS.clear()
    for location in locations:
        samples = _samples(db, location.id, counts.get(location.id, 0))
        sklearn_model = _fit_sklearn(samples) if samples else None
        averages = _averages(samples) if samples else {"cell": {}, "hour": {}}

        def _predict(
            weekday: int,
            hour: int,
            *,
            sk=sklearn_model,
            avg=averages,
        ) -> float:
            if sk is not None:
                try:
                    import pandas as pd

                    value = float(sk.predict(pd.DataFrame([[weekday, hour]], columns=["weekday", "hour"]))[0])
                    return max(0.0, min(100.0, round(value, 1)))
                except Exception:
                    logger.debug("sklearn predict failed", exc_info=True)
            cell = avg.get("cell", {}).get((weekday, hour))
            if cell is not None:
                return round(cell, 1)
            hour_mean = avg.get("hour", {}).get(hour)
            if hour_mean is not None:
                return round(hour_mean, 1)
            return _heuristic(weekday, hour)

        _MODELS[location.id] = {
            "predict": _predict,
            "kind": "sklearn" if sklearn_model is not None else "average",
        }
        logger.info("occupancy model ready for %s (%s)", location.name, _MODELS[location.id]["kind"])


def forecast(location_id: str, hours: int = 24) -> dict[str, Any]:
    model = _MODELS.get(location_id)
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    points = []
    for offset in range(hours):
        moment = now + timedelta(hours=offset)
        pct = model["predict"](moment.weekday(), moment.hour) if model else _heuristic(moment.weekday(), moment.hour)
        points.append(
            {
                "hour": moment.isoformat(),
                "label": moment.strftime("%H:00"),
                "occupancy_pct": pct,
                "band": _band(pct),
            }
        )

    hint = "Expect typical traffic through the day."
    quiet = next((p for p in points if p["band"] == "quiet"), None)
    peak = next((p for p in points if p["band"] == "peak"), None)
    if quiet:
        hint = f"Quieter around {quiet['label']}."
    if peak and (not quiet or peak["occupancy_pct"] >= 70):
        later_quiet = next((p for p in points if p["band"] == "quiet" and p["hour"] > (peak["hour"] if peak else "")), None)
        if later_quiet:
            hint = f"Peak around {peak['label']}. Quieter after {later_quiet['label']}."
        elif peak:
            hint = f"Busiest around {peak['label']}."

    live = 0
    return {"hours": points, "hint": hint, "model": model["kind"] if model else "heuristic", "live_pct": live}
