"""End-to-end API tests.

Each test runs against a throwaway SQLite file, so the suite never touches the
demo database.
"""
import os
import tempfile
from datetime import datetime, timedelta, timezone

import pytest

# Point the app at a temp database *before* importing it -- config reads the
# environment at import time.
_TMP_DB = os.path.join(tempfile.mkdtemp(prefix="parkin-test-"), "test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DB}"
os.environ["SEED_ON_STARTUP"] = "true"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.seed import DEMO_ADMIN, DEMO_USER  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _auth(client, email: str, password: str) -> dict:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}


@pytest.fixture(scope="module")
def user_headers(client):
    return _auth(client, DEMO_USER["email"], DEMO_USER["password"])


@pytest.fixture(scope="module")
def admin_headers(client):
    return _auth(client, DEMO_ADMIN["email"], DEMO_ADMIN["password"])


def _slot_times(hours: int = 2) -> tuple[str, str]:
    start = datetime.now(timezone.utc) + timedelta(minutes=10)
    return start.isoformat(), (start + timedelta(hours=hours)).isoformat()


def _first_vacant(client, location_id: str) -> dict:
    slots = client.get(f"/api/locations/{location_id}/slots").json()
    vacant = [s for s in slots if s["status"] == "vacant"]
    assert vacant, "seed should leave vacant slots"
    return vacant[0]


# ------------------------------------------------------------------ basics
def test_health(client):
    assert client.get("/api/health").json()["status"] == "ok"


def test_seed_created_locations(client):
    locations = client.get("/api/locations").json()
    assert len(locations) == 4
    assert all(loc["total_slots"] > 0 for loc in locations)
    # Seeded ACTIVE bookings must be reflected as occupied bays.
    assert any(loc["available_slots"] < loc["total_slots"] for loc in locations)


# ------------------------------------------------------------------ auth
def test_signup_and_me(client):
    res = client.post(
        "/api/auth/signup",
        json={"email": "New.User@Example.com", "name": "New User", "password": "secret123"},
    )
    assert res.status_code == 201, res.text
    token = res.json()["token"]

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "new.user@example.com"  # normalised


def test_duplicate_signup_rejected(client):
    payload = {"email": "dupe@example.com", "name": "Dupe", "password": "secret123"}
    assert client.post("/api/auth/signup", json=payload).status_code == 201
    assert client.post("/api/auth/signup", json=payload).status_code == 409


def test_bad_login_rejected(client):
    res = client.post(
        "/api/auth/login", json={"email": DEMO_USER["email"], "password": "wrong-password"}
    )
    assert res.status_code == 401


def test_protected_route_requires_token(client):
    assert client.get("/api/bookings").status_code == 401


def test_admin_route_forbidden_for_user(client, user_headers):
    assert client.get("/api/admin/stats", headers=user_headers).status_code == 403


# ------------------------------------------------------------------ booking flow
def test_full_booking_lifecycle(client, user_headers, admin_headers):
    location = client.get("/api/locations").json()[0]
    slot = _first_vacant(client, location["id"])
    start, end = _slot_times(2)

    created = client.post(
        "/api/bookings",
        json={
            "slot_id": slot["id"],
            "vehicle_number": "rj14 ab-1234",
            "start_time": start,
            "end_time": end,
        },
        headers=user_headers,
    )
    assert created.status_code == 201, created.text
    booking = created.json()

    assert booking["status"] == "pending"
    assert booking["vehicle_number"] == "RJ14AB1234"  # normalised
    assert booking["amount"] == pytest.approx(2 * location["price_per_hour"])
    assert booking["ticket_code"].startswith("PKN-")

    # Slot is held immediately, before any payment.
    assert _slot_status(client, location["id"], slot["id"]) == "reserved"

    # No ticket until it is paid for.
    assert client.get(f"/api/bookings/{booking['id']}/ticket", headers=user_headers).status_code == 409

    paid = client.post(
        "/api/payments",
        json={"booking_id": booking["id"], "method": "upi"},
        headers=user_headers,
    )
    assert paid.status_code == 201, paid.text
    assert paid.json()["status"] == "success"

    ticket = client.get(f"/api/bookings/{booking['id']}/ticket", headers=user_headers)
    assert ticket.status_code == 200
    assert ticket.json()["qr_data_uri"].startswith("data:image/png;base64,")

    # Gate scan checks the car in.
    scan = client.post(
        "/api/admin/verify-ticket",
        json={"code": booking["ticket_code"]},
        headers=admin_headers,
    )
    assert scan.status_code == 200, scan.text
    assert scan.json()["action"] == "checked_in"
    assert _slot_status(client, location["id"], slot["id"]) == "occupied"

    # Scanning again checks it out and frees the bay.
    scan_out = client.post(
        "/api/admin/verify-ticket",
        json={"code": booking["ticket_code"]},
        headers=admin_headers,
    )
    assert scan_out.json()["action"] == "checked_out"
    assert _slot_status(client, location["id"], slot["id"]) == "vacant"

    # A finished booking cannot be scanned a third time.
    assert client.post(
        "/api/admin/verify-ticket",
        json={"code": booking["ticket_code"]},
        headers=admin_headers,
    ).status_code == 409


def _slot_status(client, location_id: str, slot_id: str) -> str:
    slots = client.get(f"/api/locations/{location_id}/slots").json()
    return next(s["status"] for s in slots if s["id"] == slot_id)


def test_double_booking_is_rejected(client, user_headers):
    location = client.get("/api/locations").json()[1]
    slot = _first_vacant(client, location["id"])
    start, end = _slot_times()
    body = {
        "slot_id": slot["id"],
        "vehicle_number": "RJ14XY9999",
        "start_time": start,
        "end_time": end,
    }

    assert client.post("/api/bookings", json=body, headers=user_headers).status_code == 201
    second = client.post("/api/bookings", json=body, headers=user_headers)
    assert second.status_code == 409
    assert "taken" in second.json()["detail"].lower()


def test_cancel_releases_slot(client, user_headers):
    location = client.get("/api/locations").json()[2]
    slot = _first_vacant(client, location["id"])
    start, end = _slot_times()

    booking = client.post(
        "/api/bookings",
        json={
            "slot_id": slot["id"],
            "vehicle_number": "RJ19CD4567",
            "start_time": start,
            "end_time": end,
        },
        headers=user_headers,
    ).json()
    assert _slot_status(client, location["id"], slot["id"]) == "reserved"

    cancelled = client.post(f"/api/bookings/{booking['id']}/cancel", headers=user_headers)
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert _slot_status(client, location["id"], slot["id"]) == "vacant"

    # Paying for a cancelled booking must fail.
    assert client.post(
        "/api/payments",
        json={"booking_id": booking["id"], "method": "card"},
        headers=user_headers,
    ).status_code == 409


def test_cannot_read_someone_elses_booking(client, user_headers):
    location = client.get("/api/locations").json()[3]
    slot = _first_vacant(client, location["id"])
    start, end = _slot_times()
    booking = client.post(
        "/api/bookings",
        json={
            "slot_id": slot["id"],
            "vehicle_number": "RJ14ZZ1111",
            "start_time": start,
            "end_time": end,
        },
        headers=user_headers,
    ).json()

    other = client.post(
        "/api/auth/signup",
        json={"email": "nosy@example.com", "name": "Nosy Parker", "password": "secret123"},
    ).json()
    headers = {"Authorization": f"Bearer {other['token']}"}

    assert client.get(f"/api/bookings/{booking['id']}", headers=headers).status_code == 403


# ------------------------------------------------------------------ validation
@pytest.mark.parametrize(
    "vehicle,expected",
    [("RJ14AB1234", 201), ("rj-14 ab 1234", 201), ("!!", 422), ("", 422)],
)
def test_vehicle_number_validation(client, user_headers, vehicle, expected):
    location = client.get("/api/locations").json()[0]
    slot = _first_vacant(client, location["id"])
    start, end = _slot_times()
    res = client.post(
        "/api/bookings",
        json={
            "slot_id": slot["id"],
            "vehicle_number": vehicle,
            "start_time": start,
            "end_time": end,
        },
        headers=user_headers,
    )
    assert res.status_code == expected, res.text


def test_end_before_start_rejected(client, user_headers):
    location = client.get("/api/locations").json()[0]
    slot = _first_vacant(client, location["id"])
    start = datetime.now(timezone.utc) + timedelta(hours=3)
    res = client.post(
        "/api/bookings",
        json={
            "slot_id": slot["id"],
            "vehicle_number": "RJ14AA1111",
            "start_time": start.isoformat(),
            "end_time": (start - timedelta(hours=1)).isoformat(),
        },
        headers=user_headers,
    )
    assert res.status_code == 400


def test_minimum_one_hour_billing(client, user_headers):
    """A 10-minute stay still bills a full hour."""
    location = client.get("/api/locations").json()[0]
    slot = _first_vacant(client, location["id"])
    start = datetime.now(timezone.utc) + timedelta(minutes=5)
    res = client.post(
        "/api/bookings",
        json={
            "slot_id": slot["id"],
            "vehicle_number": "RJ14BB2222",
            "start_time": start.isoformat(),
            "end_time": (start + timedelta(minutes=10)).isoformat(),
        },
        headers=user_headers,
    )
    assert res.status_code == 201
    assert res.json()["hours"] == 1.0
    assert res.json()["amount"] == pytest.approx(location["price_per_hour"])


# ------------------------------------------------------------------ admin
def test_admin_stats(client, admin_headers):
    stats = client.get("/api/admin/stats", headers=admin_headers).json()
    assert stats["total_locations"] == 4
    assert stats["total_slots"] > 0
    assert stats["total_revenue"] > 0  # seeded payments
    assert 0 <= stats["occupancy_rate"] <= 100


def test_admin_can_override_slot(client, admin_headers):
    location = client.get("/api/locations").json()[0]
    slot = _first_vacant(client, location["id"])

    res = client.patch(
        f"/api/admin/slots/{slot['id']}", json={"status": "occupied"}, headers=admin_headers
    )
    assert res.status_code == 200
    assert res.json()["status"] == "occupied"

    client.patch(
        f"/api/admin/slots/{slot['id']}", json={"status": "vacant"}, headers=admin_headers
    )


def test_admin_create_and_delete_location(client, admin_headers):
    created = client.post(
        "/api/locations",
        json={
            "name": "Amber Fort",
            "address": "Devisinghpura, Amer, Jaipur",
            "description": "Hilltop fort above Maota Lake.",
            "image_url": "",
            "rows": 3,
            "cols": 4,
            "price_per_hour": 55.0,
        },
        headers=admin_headers,
    )
    assert created.status_code == 201, created.text
    location = created.json()
    assert location["total_slots"] == 12
    assert location["available_slots"] == 12

    deleted = client.delete(f"/api/locations/{location['id']}", headers=admin_headers)
    assert deleted.status_code == 200


def test_cannot_delete_location_with_live_bookings(client, admin_headers, user_headers):
    created = client.post(
        "/api/locations",
        json={
            "name": "Albert Hall",
            "address": "Ram Niwas Garden, Jaipur",
            "rows": 2,
            "cols": 2,
            "price_per_hour": 40.0,
        },
        headers=admin_headers,
    ).json()

    slot = _first_vacant(client, created["id"])
    start, end = _slot_times()
    client.post(
        "/api/bookings",
        json={
            "slot_id": slot["id"],
            "vehicle_number": "RJ14QQ8888",
            "start_time": start,
            "end_time": end,
        },
        headers=user_headers,
    )

    res = client.delete(f"/api/locations/{created['id']}", headers=admin_headers)
    assert res.status_code == 409
    assert "active" in res.json()["detail"].lower()


# ------------------------------------------------------------------ realtime
def test_websocket_receives_slot_updates(client, user_headers):
    location = client.get("/api/locations").json()[0]
    slot = _first_vacant(client, location["id"])
    start, end = _slot_times()

    with client.websocket_connect("/ws") as ws:
        client.post(
            "/api/bookings",
            json={
                "slot_id": slot["id"],
                "vehicle_number": "RJ14WS0001",
                "start_time": start,
                "end_time": end,
            },
            headers=user_headers,
        )
        message = ws.receive_json()

    assert message["event"] == "slot.updated"
    assert message["payload"]["id"] == slot["id"]
    assert message["payload"]["status"] == "reserved"
