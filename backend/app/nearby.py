"""Server-side Overpass lookups for amenities around a lot.

The browser never talks to OSM directly, so there is no CORS fight and one
in-memory cache covers every open lot page.
"""
from __future__ import annotations

import logging
import math
import time
from typing import Any
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
RADIUS_M = 1500
CACHE_SECONDS = 600
CACHE_VERSION = "v2"

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}

_SELECTORS = [
    '["amenity"~"hospital|clinic|doctors"]',
    '["amenity"~"restaurant|cafe|fast_food|food_court"]',
    '["tourism"~"hotel|guest_house|hostel"]',
    '["amenity"~"toilets|atm|bank|pharmacy|police|drinking_water|charging_station|fuel|post_office"]',
    '["shop"~"supermarket|mall|convenience|marketplace"]',
    '["amenity"="marketplace"]',
    '["tourism"~"attraction|museum|gallery|viewpoint"]',
    '["historic"~"palace|fort|monument|castle"]',
]


def _query(lat: float, lng: float) -> str:
    parts = [f"nwr{selector}(around:{RADIUS_M},{lat},{lng});" for selector in _SELECTORS]
    joined = "\n".join(parts)
    return f"[out:json][timeout:18];({joined});out center tags 80;"


def _place_name(tags: dict) -> str:
    return tags.get("name") or tags.get("name:en") or tags.get("brand") or "Unnamed"


def _kind_and_tab(tags: dict) -> tuple[str, str] | None:
    amenity = tags.get("amenity", "")
    shop = tags.get("shop", "")
    tourism = tags.get("tourism", "")
    historic = tags.get("historic", "")

    if amenity in {"hospital", "clinic", "doctors"}:
        return ("clinic" if amenity == "doctors" else amenity), "hospital"
    if tourism in {"hotel", "guest_house", "hostel"}:
        return ("hotel" if tourism == "guest_house" else tourism), "restaurant"
    if amenity in {"restaurant", "cafe", "fast_food", "food_court"}:
        kind = "cafe" if amenity == "cafe" else "restaurant"
        return kind, "restaurant"
    if amenity in {
        "toilets",
        "atm",
        "bank",
        "pharmacy",
        "police",
        "drinking_water",
        "charging_station",
        "fuel",
        "post_office",
    }:
        return ("petrol" if amenity == "fuel" else amenity), "amenities"
    if shop in {"supermarket", "mall", "convenience", "marketplace"} or amenity == "marketplace":
        return "market", "market"
    if tourism in {"attraction", "museum", "gallery", "viewpoint"} or historic in {
        "palace",
        "fort",
        "monument",
        "castle",
    }:
        return "landmark", "tourist"
    return None


def _address(tags: dict) -> str:
    if tags.get("addr:full"):
        return str(tags["addr:full"])
    parts = [
        tags.get("addr:housenumber"),
        tags.get("addr:street"),
        tags.get("addr:suburb") or tags.get("addr:neighbourhood") or tags.get("addr:locality"),
        tags.get("addr:city") or tags.get("addr:district"),
    ]
    return ", ".join(part for part in parts if part)


def _image_url(tags: dict) -> str:
    image = tags.get("image") or tags.get("image:0")
    if isinstance(image, str) and image.startswith("http"):
        return image
    commons = tags.get("wikimedia_commons")
    if commons:
        filename = commons.split(":", 1)[-1] if ":" in commons else commons
        return f"https://commons.wikimedia.org/wiki/Special:FilePath/{quote(filename)}?width=800"
    return ""


def _point(element: dict) -> tuple[float | None, float | None]:
    if "lat" in element and "lon" in element:
        return float(element["lat"]), float(element["lon"])
    center = element.get("center") or {}
    if "lat" in center and "lon" in center:
        return float(center["lat"]), float(center["lon"])
    return None, None


def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    radius = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(d_lng / 2) ** 2
    return int(round(2 * radius * math.asin(math.sqrt(a))))


def _blurb(tags: dict, kind: str) -> str:
    bits: list[str] = []
    cuisine = (tags.get("cuisine") or "").replace("_", ", ").replace(";", ", ")
    if cuisine:
        bits.append(cuisine.title())
    if tags.get("stars"):
        bits.append(f"{tags['stars']}-star")
    if tags.get("brand") and tags.get("brand") != tags.get("name"):
        bits.append(str(tags["brand"]))
    if tags.get("operator") and kind in {"petrol", "hospital", "pharmacy"}:
        bits.append(str(tags["operator"]))
    description = tags.get("description") or tags.get("note")
    if description:
        bits.append(str(description)[:160])
    return " · ".join(bits)[:240]


def fetch_nearby(lat: float, lng: float) -> dict[str, Any]:
    key = f"{CACHE_VERSION}:{round(lat, 4)}:{round(lng, 4)}"
    cached = _CACHE.get(key)
    now = time.monotonic()
    if cached and now - cached[0] < CACHE_SECONDS:
        return cached[1]

    empty: dict[str, Any] = {"available": False, "amenities": []}
    try:
        with httpx.Client(timeout=18.0) as client:
            response = client.post(
                OVERPASS_URL,
                data={"data": _query(lat, lng)},
                headers={"User-Agent": "Park.in/1.0 (SIH demo parking)"},
            )
            response.raise_for_status()
            payload = response.json()
    except Exception:
        logger.warning("overpass lookup failed near %s,%s", lat, lng, exc_info=True)
        return empty

    seen: set[str] = set()
    amenities: list[dict[str, Any]] = []
    per_tab: dict[str, int] = {}
    for element in payload.get("elements") or []:
        tags = element.get("tags") or {}
        mapped = _kind_and_tab(tags)
        plat, plng = _point(element)
        name = _place_name(tags)
        if not mapped or plat is None or name == "Unnamed":
            continue
        kind, tab = mapped
        if per_tab.get(tab, 0) >= 16:
            continue
        dedupe = f"{tab}:{name.lower()}"
        if dedupe in seen:
            continue
        seen.add(dedupe)
        per_tab[tab] = per_tab.get(tab, 0) + 1
        amenities.append(
            {
                "name": name,
                "category": tab,
                "kind": kind,
                "latitude": plat,
                "longitude": plng,
                "address": _address(tags),
                "phone": tags.get("phone") or tags.get("contact:phone") or "",
                "website": tags.get("website") or tags.get("contact:website") or "",
                "opening_hours": tags.get("opening_hours") or "",
                "cuisine": (tags.get("cuisine") or "").replace("_", ", ").replace(";", ", "),
                "description": _blurb(tags, kind),
                "image_url": _image_url(tags),
                "distance_m": _distance_m(lat, lng, plat, plng),
            }
        )

    amenities.sort(key=lambda place: (place["distance_m"], place["name"]))
    result = {"available": True, "amenities": amenities}
    _CACHE[key] = (now, result)
    return result
