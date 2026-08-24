"""Turn a driver's typed destination into coordinates, then measure lots.

Uses Google Maps (Geocoding + Places) when GOOGLE_MAPS_API_KEY is set.
Otherwise Photon and Nominatim, biased to Jaipur. Lot names are not the
search index — the destination is a real place, and registered lots are
ranked by distance to that place.
"""
from __future__ import annotations

import logging
import math
import time
from typing import Any

import httpx

from .config import GOOGLE_MAPS_API_KEY

logger = logging.getLogger(__name__)

JAIPUR = (26.9124, 75.7873)
# left, top, right, bottom — Jaipur metro + Amber
VIEWBOX = "75.55,27.12,76.10,26.72"
USER_AGENT = "Park.in/1.0 (SIH parking; destination search)"
CACHE_TTL = 180.0
MAX_COVERAGE_KM = 45.0

PHOTON_URL = "https://photon.komoot.io/api/"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OSRM_TABLE = "https://router.project-osrm.org/table/v1/driving/"
GOOGLE_GEOCODE = "https://maps.googleapis.com/maps/api/geocode/json"
GOOGLE_TEXT = "https://maps.googleapis.com/maps/api/place/textsearch/json"

EARTH_KM = 6371.0
_CACHE: dict[str, tuple[float, Any]] = {}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * EARTH_KM * math.asin(math.sqrt(min(1.0, a)))


def in_coverage(lat: float, lon: float) -> bool:
    return haversine_km(lat, lon, *JAIPUR) <= MAX_COVERAGE_KM


def _cached(key: str, builder):
    now = time.monotonic()
    hit = _CACHE.get(key)
    if hit and now - hit[0] < CACHE_TTL:
        return hit[1]
    value = builder()
    if value:
        _CACHE[key] = (now, value)
    return value


def _get_json(url: str, params: dict, timeout: float = 5.0) -> Any:
    with httpx.Client(timeout=timeout, headers={"User-Agent": USER_AGENT}) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        return response.json()


def _join(*parts: str | None) -> str:
    seen: list[str] = []
    for part in parts:
        text = (part or "").strip().strip(",")
        if text and text not in seen:
            seen.append(text)
    return ", ".join(seen[:4])


def _google_text_search(query: str, limit: int) -> list[dict]:
    if not GOOGLE_MAPS_API_KEY:
        return []
    payload = _get_json(
        GOOGLE_TEXT,
        {
            "query": query,
            "location": f"{JAIPUR[0]},{JAIPUR[1]}",
            "radius": 35000,
            "region": "in",
            "key": GOOGLE_MAPS_API_KEY,
        },
    )
    places = []
    for row in payload.get("results") or []:
        loc = (row.get("geometry") or {}).get("location") or {}
        if "lat" not in loc or "lng" not in loc:
            continue
        places.append(
            {
                "label": row.get("name") or row.get("formatted_address") or query,
                "latitude": float(loc["lat"]),
                "longitude": float(loc["lng"]),
            }
        )
        if len(places) >= limit:
            break
    return places


def _google_geocode(query: str) -> dict | None:
    if not GOOGLE_MAPS_API_KEY:
        return None
    payload = _get_json(
        GOOGLE_GEOCODE,
        {
            "address": query,
            "region": "in",
            "bounds": "26.72,75.55|27.12,76.10",
            "key": GOOGLE_MAPS_API_KEY,
        },
    )
    results = payload.get("results") or []
    if not results:
        return None
    loc = results[0]["geometry"]["location"]
    return {
        "label": results[0].get("formatted_address") or query,
        "latitude": float(loc["lat"]),
        "longitude": float(loc["lng"]),
    }


def _photon_search(query: str, limit: int) -> list[dict]:
    q = query.strip()
    if "jaipur" not in q.lower():
        q = f"{q}, Jaipur"
    payload = _get_json(
        PHOTON_URL,
        {"q": q, "lat": JAIPUR[0], "lon": JAIPUR[1], "limit": limit, "lang": "en"},
    )
    places = []
    for feature in payload.get("features") or []:
        coords = (feature.get("geometry") or {}).get("coordinates") or []
        props = feature.get("properties") or {}
        if len(coords) < 2:
            continue
        lon, lat = float(coords[0]), float(coords[1])
        label = _join(
            props.get("name") or props.get("street"),
            props.get("district") or props.get("locality"),
            props.get("city"),
            props.get("state"),
        )
        if not label:
            continue
        places.append({"label": label, "latitude": lat, "longitude": lon})
    return places


def _nominatim_search(query: str, limit: int) -> list[dict]:
    q = query.strip()
    lowered = q.lower()
    if "jaipur" not in lowered and "india" not in lowered:
        q = f"{q}, Jaipur, Rajasthan, India"
    payload = _get_json(
        NOMINATIM_URL,
        {
            "q": q,
            "format": "json",
            "limit": str(limit),
            "addressdetails": "1",
            "countrycodes": "in",
            "viewbox": VIEWBOX,
            "dedupe": "1",
        },
        timeout=6.0,
    )
    places = []
    for row in payload or []:
        display = str(row.get("display_name") or "")
        short = ", ".join(part.strip() for part in display.split(",")[:4] if part.strip())
        places.append(
            {
                "label": short or query,
                "latitude": float(row["lat"]),
                "longitude": float(row["lon"]),
            }
        )
    return places


def _rank(places: list[dict]) -> list[dict]:
    def score(place: dict) -> tuple:
        lat, lon = place["latitude"], place["longitude"]
        return (0 if in_coverage(lat, lon) else 1, haversine_km(lat, lon, *JAIPUR))

    unique: list[dict] = []
    seen: set[tuple[float, float]] = set()
    for place in sorted(places, key=score):
        key = (round(place["latitude"], 4), round(place["longitude"], 4))
        if key in seen:
            continue
        seen.add(key)
        unique.append(place)
    local = [place for place in unique if in_coverage(place["latitude"], place["longitude"])]
    return local or unique


def suggest_places(query: str, limit: int = 6) -> list[dict]:
    needle = query.strip()
    if len(needle) < 2:
        return []

    def load():
        collected: list[dict] = []
        try:
            collected.extend(_google_text_search(needle, limit))
        except Exception:
            logger.warning("google places lookup failed for %s", needle, exc_info=True)
        if len(collected) < 2:
            try:
                collected.extend(_photon_search(needle, limit))
            except Exception:
                logger.warning("photon lookup failed for %s", needle, exc_info=True)
        if not collected:
            try:
                collected.extend(_nominatim_search(needle, limit))
            except Exception:
                logger.warning("nominatim lookup failed for %s", needle, exc_info=True)
        return _rank(collected)[:limit]

    return _cached(f"suggest:{needle.lower()}:{limit}", load) or []


def geocode_place(query: str) -> tuple[float | None, float | None, str | None]:
    needle = query.strip()
    if not needle:
        return None, None, None

    def load():
        try:
            google = _google_geocode(needle)
            if google:
                return google
        except Exception:
            logger.warning("google geocode failed for %s", needle, exc_info=True)
        suggestions = suggest_places(needle, limit=5)
        return suggestions[0] if suggestions else None

    place = _cached(f"geocode:{needle.lower()}", load)
    if not place:
        return None, None, None
    return place["latitude"], place["longitude"], place["label"]


def geocode_address(address: str) -> tuple[float | None, float | None]:
    lat, lon, _ = geocode_place(address)
    return lat, lon


def driving_km(
    origin_lat: float, origin_lon: float, dests: list[tuple[float, float]]
) -> list[float | None] | None:
    """Road kilometres via OSRM. None means 'use straight-line instead'."""
    if not dests:
        return []
    coords = [f"{origin_lon},{origin_lat}"] + [f"{lon},{lat}" for lat, lon in dests]
    dest_idx = ";".join(str(i) for i in range(1, len(dests) + 1))
    url = f"{OSRM_TABLE}{';'.join(coords)}"
    try:
        payload = _get_json(
            url,
            {"sources": "0", "destinations": dest_idx, "annotations": "distance"},
            timeout=2.5,
        )
    except Exception:
        logger.info("osrm table lookup skipped")
        return None
    row = (payload.get("distances") or [None])[0]
    if not row:
        return None
    return [None if meters is None else round(float(meters) / 1000.0, 3) for meters in row]
