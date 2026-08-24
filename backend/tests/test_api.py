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
from app.seed import DEMO_ADMIN, DEMO_USER, LOCATIONS  # noqa: E402


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


def test_driver_checkout_releases_slot_everywhere(client, user_headers, admin_headers):
    """A driver checking out from the ticket must free the bay for everyone --
    the lot grid, the public availability counts and the operator stats."""
    location = client.get("/api/locations").json()[2]
    slot = _first_vacant(client, location["id"])
    start, end = _slot_times()

    def _available(location_id: str) -> int:
        lots = client.get("/api/locations").json()
        return next(l["available_slots"] for l in lots if l["id"] == location_id)

    free_before = _available(location["id"])
    vacant_before = client.get("/api/admin/stats", headers=admin_headers).json()["vacant_slots"]

    booking = client.post(
        "/api/bookings",
        json={
            "slot_id": slot["id"],
            "vehicle_number": "RJ14CO1234",
            "start_time": start,
            "end_time": end,
        },
        headers=user_headers,
    ).json()
    client.post(
        "/api/payments",
        json={"booking_id": booking["id"], "method": "upi"},
        headers=user_headers,
    )
    client.post(f"/api/bookings/{booking['id']}/check-in", headers=user_headers)
    assert _slot_status(client, location["id"], slot["id"]) == "occupied"
    assert _available(location["id"]) == free_before - 1

    out = client.post(f"/api/bookings/{booking['id']}/check-out", headers=user_headers)
    assert out.status_code == 200, out.text
    assert out.json()["status"] == "completed"
    assert out.json()["checked_out_at"] is not None

    assert _slot_status(client, location["id"], slot["id"]) == "vacant"
    assert _available(location["id"]) == free_before
    stats = client.get("/api/admin/stats", headers=admin_headers).json()
    assert stats["vacant_slots"] == vacant_before

    # The freed bay is bookable again, and the finished booking cannot check
    # out (or be scanned) twice.
    assert client.post(
        f"/api/bookings/{booking['id']}/check-out", headers=user_headers
    ).status_code == 409
    assert client.post(
        "/api/admin/verify-ticket",
        json={"code": booking["ticket_code"]},
        headers=admin_headers,
    ).status_code == 409
    rebook = client.post(
        "/api/bookings",
        json={
            "slot_id": slot["id"],
            "vehicle_number": "RJ14CO5678",
            "start_time": start,
            "end_time": end,
        },
        headers=user_headers,
    )
    assert rebook.status_code == 201
    client.post(f"/api/bookings/{rebook.json()['id']}/cancel", headers=user_headers)


def test_checkout_broadcasts_freed_slot(client, user_headers):
    """Every open screen repaints off this broadcast, so it must carry the
    vacant status -- not the occupied one from before the commit."""
    location = client.get("/api/locations").json()[3]
    slot = _first_vacant(client, location["id"])
    start, end = _slot_times()

    booking = client.post(
        "/api/bookings",
        json={
            "slot_id": slot["id"],
            "vehicle_number": "RJ14WS4321",
            "start_time": start,
            "end_time": end,
        },
        headers=user_headers,
    ).json()
    client.post(
        "/api/payments",
        json={"booking_id": booking["id"], "method": "upi"},
        headers=user_headers,
    )
    client.post(f"/api/bookings/{booking['id']}/check-in", headers=user_headers)

    with client.websocket_connect("/ws") as ws:
        client.post(f"/api/bookings/{booking['id']}/check-out", headers=user_headers)
        message = ws.receive_json()

    assert message["event"] == "slot.updated"
    assert message["payload"]["id"] == slot["id"]
    assert message["payload"]["status"] == "vacant"


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


def test_admin_can_update_location_details(client, admin_headers, user_headers):
    created = client.post(
        "/api/locations",
        json={
            "name": "Jantar Mantar",
            "address": "Gangori Bazaar, Jaipur",
            "description": "Old copy.",
            "image_url": "https://example.com/lot.jpg",
            "rows": 2,
            "cols": 2,
            "price_per_hour": 40.0,
            "latitude": 26.9248,
            "longitude": 75.8246,
            "valet_enabled": False,
            "valet_price_per_hour": 50.0,
        },
        headers=admin_headers,
    )
    assert created.status_code == 201, created.text
    location_id = created.json()["id"]

    forbidden = client.patch(
        f"/api/locations/{location_id}",
        json={"name": "Nope"},
        headers=user_headers,
    )
    assert forbidden.status_code == 403

    updated = client.patch(
        f"/api/locations/{location_id}",
        json={
            "name": "Jantar Mantar Lot",
            "address": "Triangle, Chandpole, Jaipur",
            "description": "UNESCO observatory parking.",
            "price_per_hour": 65.0,
            "valet_enabled": True,
            "valet_price_per_hour": 90.0,
            "latitude": 26.9248,
            "longitude": 75.8246,
        },
        headers=admin_headers,
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["name"] == "Jantar Mantar Lot"
    assert body["address"] == "Triangle, Chandpole, Jaipur"
    assert body["description"] == "UNESCO observatory parking."
    assert body["price_per_hour"] == 65.0
    assert body["valet_enabled"] is True
    assert body["valet_price_per_hour"] == 90.0
    assert body["rows"] == 2
    assert body["cols"] == 2

    listed = next(loc for loc in client.get("/api/locations").json() if loc["id"] == location_id)
    assert listed["name"] == "Jantar Mantar Lot"

    client.delete(f"/api/locations/{location_id}", headers=admin_headers)


def test_admin_can_choose_slot_kinds(client, admin_headers):
    layout = [
        {"row": r, "col": c, "kind": "standard"}
        for r in range(2)
        for c in range(3)
    ]
    layout[0]["kind"] = "ev"
    layout[1]["kind"] = "ev"
    layout[3]["kind"] = "heavy"
    layout[4]["kind"] = "heavy"

    created = client.post(
        "/api/locations",
        json={
            "name": "Albert Hall Museum",
            "address": "Ram Niwas Garden, Jaipur",
            "rows": 2,
            "cols": 3,
            "price_per_hour": 40.0,
            "latitude": 26.9117,
            "longitude": 75.8197,
            "slot_layout": layout,
        },
        headers=admin_headers,
    )
    assert created.status_code == 201, created.text
    location_id = created.json()["id"]
    slots = client.get(f"/api/locations/{location_id}/slots").json()
    kinds = {(s["row"], s["col"]): s["kind"] for s in slots}
    assert kinds[(0, 0)] == "ev"
    assert kinds[(0, 1)] == "ev"
    assert kinds[(1, 0)] == "heavy"
    assert kinds[(1, 1)] == "heavy"
    assert kinds[(0, 2)] == "standard"

    layout[2]["kind"] = "ev"
    updated = client.patch(
        f"/api/locations/{location_id}/layout",
        json={"slots": layout},
        headers=admin_headers,
    )
    assert updated.status_code == 200, updated.text
    assert next(s for s in updated.json() if s["row"] == 0 and s["col"] == 2)["kind"] == "ev"


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


def test_seeded_locations_have_coordinates(client):
    names = {spec["name"] for spec in LOCATIONS}
    seeded = [loc for loc in client.get("/api/locations").json() if loc["name"] in names]
    assert len(seeded) == 4
    assert all(loc["latitude"] is not None and loc["longitude"] is not None for loc in seeded)


def test_payment_config_is_simulated_by_default(client):
    res = client.get("/api/payments/config")
    assert res.status_code == 200
    assert res.json()["provider"] == "simulated"


def _seed_lot(client, name: str = "Hawa Mahal") -> dict:
    return next(loc for loc in client.get("/api/locations").json() if loc["name"] == name)


def test_google_demo_login(client):
    res = client.post("/api/auth/google", json={"credential": "demo"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["user"]["email"] == "google.demo@parkin.app"
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.status_code == 200


def test_slots_have_kinds(client):
    location = _seed_lot(client)
    slots = client.get(f"/api/locations/{location['id']}/slots").json()
    kinds = {s["kind"] for s in slots}
    assert {"standard", "ev", "heavy"} <= kinds
    assert "valet" not in kinds


def test_valet_adds_operator_price(client, user_headers):
    location = next(loc for loc in client.get("/api/locations").json() if loc["valet_enabled"])
    slots = client.get(f"/api/locations/{location['id']}/slots").json()
    slot = next(s for s in slots if s["status"] == "vacant" and s["kind"] == "standard")
    start, end = _slot_times(2)
    created = client.post(
        "/api/bookings",
        json={
            "slot_id": slot["id"],
            "vehicle_number": "RJ14VL5555",
            "start_time": start,
            "end_time": end,
            "valet": True,
        },
        headers=user_headers,
    )
    assert created.status_code == 201, created.text
    booking = created.json()
    assert booking["valet"] is True
    expected = 2 * location["price_per_hour"] + location["valet_price_per_hour"]
    assert booking["amount"] == pytest.approx(expected)
    assert booking["valet_fee"] == pytest.approx(location["valet_price_per_hour"])


def test_valet_rejected_when_operator_disables_it(client, user_headers, admin_headers):
    location = next(loc for loc in client.get("/api/locations").json() if loc["valet_enabled"])
    off = client.patch(
        f"/api/locations/{location['id']}/valet",
        json={"valet_enabled": False, "valet_price_per_hour": 50},
        headers=admin_headers,
    )
    assert off.status_code == 200
    slots = client.get(f"/api/locations/{location['id']}/slots").json()
    slot = next(s for s in slots if s["status"] == "vacant" and s["kind"] == "standard")
    start, end = _slot_times()
    res = client.post(
        "/api/bookings",
        json={
            "slot_id": slot["id"],
            "vehicle_number": "RJ14VL0001",
            "start_time": start,
            "end_time": end,
            "valet": True,
        },
        headers=user_headers,
    )
    assert res.status_code == 400
    client.patch(
        f"/api/locations/{location['id']}/valet",
        json={"valet_enabled": True, "valet_price_per_hour": location["valet_price_per_hour"]},
        headers=admin_headers,
    )


def test_valet_allowed_on_ev_bays(client, user_headers):
    location = next(loc for loc in client.get("/api/locations").json() if loc["valet_enabled"])
    slots = client.get(f"/api/locations/{location['id']}/slots").json()
    slot = next(s for s in slots if s["status"] == "vacant" and s["kind"] == "ev")
    start, end = _slot_times()
    created = client.post(
        "/api/bookings",
        json={
            "slot_id": slot["id"],
            "vehicle_number": "RJ14EV7777",
            "start_time": start,
            "end_time": end,
            "valet": True,
        },
        headers=user_headers,
    )
    assert created.status_code == 201, created.text
    assert created.json()["valet"] is True


def test_valet_rejected_for_truck_bays(client, user_headers):
    location = next(loc for loc in client.get("/api/locations").json() if loc["valet_enabled"])
    slots = client.get(f"/api/locations/{location['id']}/slots").json()
    slot = next(s for s in slots if s["status"] == "vacant" and s["kind"] == "heavy")
    start, end = _slot_times()
    res = client.post(
        "/api/bookings",
        json={
            "slot_id": slot["id"],
            "vehicle_number": "RJ14TR0001",
            "start_time": start,
            "end_time": end,
            "valet": True,
        },
        headers=user_headers,
    )
    assert res.status_code == 400
    assert "truck" in res.json()["detail"].lower()


def test_occupancy_forecast(client):
    location = _seed_lot(client)
    res = client.get(f"/api/locations/{location['id']}/predict-occupancy")
    assert res.status_code == 200, res.text
    body = res.json()
    assert len(body["hours"]) == 24
    assert body["hours"][0]["band"] in {"quiet", "busy", "peak"}


def test_nearby_does_not_break_booking(client):
    location = _seed_lot(client)
    res = client.get(f"/api/locations/{location['id']}/nearby")
    assert res.status_code == 200
    body = res.json()
    assert "available" in body
    assert "amenities" in body


def test_feedback_after_checkout(client, user_headers, admin_headers):
    location = _seed_lot(client, "Jal Mahal")
    slot = _first_vacant(client, location["id"])
    start, end = _slot_times()
    created = client.post(
        "/api/bookings",
        json={
            "slot_id": slot["id"],
            "vehicle_number": "RJ14FB7777",
            "start_time": start,
            "end_time": end,
        },
        headers=user_headers,
    )
    assert created.status_code == 201, created.text
    booking = created.json()
    client.post("/api/payments", json={"booking_id": booking["id"], "method": "cash"}, headers=user_headers)
    client.post("/api/admin/verify-ticket", json={"code": booking["ticket_code"]}, headers=admin_headers)
    client.post("/api/admin/verify-ticket", json={"code": booking["ticket_code"]}, headers=admin_headers)
    rated = client.post(
        f"/api/bookings/{booking['id']}/feedback",
        json={"rating": 5, "comment": "Smooth gate"},
        headers=user_headers,
    )
    assert rated.status_code == 201, rated.text
    again = client.get(f"/api/bookings/{booking['id']}", headers=user_headers)
    assert again.json()["rating"] == 5


def test_nearest_bay_matches_lot_name(client, monkeypatch):
    monkeypatch.setattr("app.routers.locations.driving_km", lambda *a, **k: None)
    res = client.get("/api/locations/nearest", params={"q": "Hawa Mahal"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["location"]["name"] == "Hawa Mahal"
    assert body["location"]["available_slots"] > 0
    assert body["distance_km"] == 0
    assert body["destination"] == "Hawa Mahal"


def test_nearest_bay_does_not_snap_to_lot_address(client, monkeypatch):
    """'Amer Rd' lives in Jal Mahal's address — still geocode the place the driver typed."""
    monkeypatch.setattr("app.routers.locations.driving_km", lambda *a, **k: None)
    monkeypatch.setattr(
        "app.routers.locations.geocode_place",
        lambda q: (26.9855, 75.8513, "Amer Fort, Jaipur"),
    )
    res = client.get("/api/locations/nearest", params={"q": "Amer Rd"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["destination"] == "Amer Fort, Jaipur"
    assert body["location"]["name"] == "Jal Mahal"
    assert body["distance_km"] > 0


def test_nearest_bay_uses_geocoded_destination(client, monkeypatch):
    monkeypatch.setattr("app.routers.locations.driving_km", lambda *a, **k: None)
    monkeypatch.setattr(
        "app.routers.locations.geocode_place",
        lambda q: (26.9248, 75.8246, "Jantar Mantar, Jaipur"),
    )
    res = client.get("/api/locations/nearest", params={"q": "Jantar Mantar"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["location"]["name"] == "City Palace"
    assert body["destination"] == "Jantar Mantar, Jaipur"
    assert body["distance_km"] > 0


def test_nearest_bay_uses_pinned_coordinates(client, monkeypatch):
    monkeypatch.setattr(
        "app.routers.locations.geocode_place",
        lambda q: (_ for _ in ()).throw(AssertionError("should use lat/lng")),
    )
    monkeypatch.setattr("app.routers.locations.driving_km", lambda *a, **k: None)
    res = client.get(
        "/api/locations/nearest",
        params={"q": "Jantar Mantar", "lat": 26.9248, "lng": 75.8246},
    )
    assert res.status_code == 200, res.text
    assert res.json()["location"]["name"] == "City Palace"


def test_nearby_bays_lists_open_lots(client, monkeypatch):
    monkeypatch.setattr("app.routers.locations.driving_km", lambda *a, **k: None)
    monkeypatch.setattr(
        "app.routers.locations.geocode_place",
        lambda q: (26.9248, 75.8246, "Jantar Mantar, Jaipur"),
    )
    res = client.get("/api/locations/nearby-bays", params={"q": "Jantar Mantar"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["destination"] == "Jantar Mantar, Jaipur"
    assert body["lots"]
    assert body["lots"][0]["location"]["name"] == "City Palace"
    assert all(item["location"]["available_slots"] > 0 for item in body["lots"])
    assert all(item["distance_km"] <= 8 for item in body["lots"])
    assert len(body["lots"]) <= 8
    distances = [item["distance_km"] for item in body["lots"]]
    assert distances == sorted(distances)


def test_place_suggestions(client, monkeypatch):
    monkeypatch.setattr(
        "app.routers.locations.suggest_places",
        lambda q: [{"label": "Albert Hall Museum, Jaipur", "latitude": 26.9116, "longitude": 75.8195}],
    )
    res = client.get("/api/locations/places", params={"q": "Albert Hall"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body[0]["label"].startswith("Albert Hall")


def test_nearest_bay_unknown_place(client, monkeypatch):
    monkeypatch.setattr(
        "app.routers.locations.geocode_place",
        lambda q: (None, None, None),
    )
    res = client.get("/api/locations/nearest", params={"q": "xyzzy nowhere"})
    assert res.status_code == 404


def test_nearby_bays_stay_inside_two_km(client, monkeypatch):
    monkeypatch.setattr("app.routers.locations.driving_km", lambda *a, **k: None)
    res = client.get("/api/locations/nearby-bays", params={"q": "Hawa Mahal"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert 1 <= len(body["lots"]) <= 5
    assert all(lot["distance_km"] <= 2 for lot in body["lots"])
    assert body["lots"][0]["location"]["name"] == "Hawa Mahal"
    assert body["lots"][0]["distance_km"] == 0
    names = [lot["location"]["name"] for lot in body["lots"]]
    assert names == sorted(names, key=lambda n: next(lot["distance_km"] for lot in body["lots"] if lot["location"]["name"] == n))


def test_nearby_bays_empty_outside_radius(client, monkeypatch):
    monkeypatch.setattr("app.routers.locations.driving_km", lambda *a, **k: None)
    monkeypatch.setattr(
        "app.routers.locations.geocode_place",
        lambda q: (27.05, 75.82, "Far north Jaipur"),
    )
    res = client.get("/api/locations/nearby-bays", params={"q": "Far north Jaipur"})
    assert res.status_code == 200, res.text
    assert res.json()["lots"] == []



# ------------------------------------------------------------------ feedback
def _completed_booking(client, user_headers, admin_headers, lot_name: str, plate: str) -> dict:
    """Book, pay and scan in at the gate so the visit is parked and checkable-out."""
    location = _seed_lot(client, lot_name)
    slot = _first_vacant(client, location["id"])
    start, end = _slot_times()
    created = client.post(
        "/api/bookings",
        json={
            "slot_id": slot["id"],
            "vehicle_number": plate,
            "start_time": start,
            "end_time": end,
        },
        headers=user_headers,
    )
    assert created.status_code == 201, created.text
    booking = created.json()
    client.post(
        "/api/payments",
        json={"booking_id": booking["id"], "method": "cash"},
        headers=user_headers,
    )
    client.post(
        "/api/admin/verify-ticket", json={"code": booking["ticket_code"]}, headers=admin_headers
    )
    return booking


def test_self_checkout_completes_and_frees_the_bay(client, user_headers, admin_headers):
    """The driver's own check-out must release the bay, exactly like a gate scan."""
    booking = _completed_booking(client, user_headers, admin_headers, "City Palace", "RJ14CO0001")
    res = client.post(f"/api/bookings/{booking['id']}/check-out", headers=user_headers)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "completed"
    assert res.json()["checked_out_at"] is not None
    assert _slot_status(client, booking["location_id"], booking["slot_id"]) == "vacant"


def test_feedback_options_catalogue(client):
    body = client.get("/api/feedback/options").json()
    assert {tag["id"] for tag in body["issues"]} >= {"felt_unsafe", "gate_scan_failed"}
    assert any(tag["severe"] for tag in body["issues"])
    assert not any(tag["severe"] for tag in body["highlights"])
    assert body["aspects"] == ["cleanliness", "safety", "staff", "value"]


def test_detailed_feedback_is_triaged_and_referenced(client, user_headers, admin_headers):
    booking = _completed_booking(client, user_headers, admin_headers, "Nahargarh Fort", "RJ14FB0002")
    client.post(f"/api/bookings/{booking['id']}/check-out", headers=user_headers)

    res = client.post(
        f"/api/bookings/{booking['id']}/feedback",
        json={
            "rating": 2,
            "comment": "Bay was taken when I arrived",
            "cleanliness": 3,
            "safety": 1,
            "issues": ["bay_occupied", "poor_lighting"],
            "would_recommend": False,
            "contact_me": True,
            "contact_phone": "9876543210",
        },
        headers=user_headers,
    )
    assert res.status_code == 201, res.text
    body = res.json()
    # A safety/occupancy complaint must not land in the operator's pile as "low".
    assert body["priority"] == "high"
    assert body["status"] == "new"
    assert body["reference_code"].startswith("FBK-")
    assert body["issues"] == ["bay_occupied", "poor_lighting"]
    assert body["editable_until"] is not None

    read_back = client.get(f"/api/bookings/{booking['id']}/feedback", headers=user_headers)
    assert read_back.status_code == 200
    assert read_back.json()["contact_phone"] == "9876543210"


def test_happy_feedback_is_low_priority(client, user_headers, admin_headers):
    booking = _completed_booking(client, user_headers, admin_headers, "Jal Mahal", "RJ14FB0003")
    client.post(f"/api/bookings/{booking['id']}/check-out", headers=user_headers)
    res = client.post(
        f"/api/bookings/{booking['id']}/feedback",
        json={"rating": 5, "highlights": ["clean", "quick_entry"], "would_recommend": True},
        headers=user_headers,
    )
    assert res.status_code == 201, res.text
    assert res.json()["priority"] == "low"
    assert res.json()["highlights"] == ["clean", "quick_entry"]


def test_feedback_rejects_unknown_tag(client, user_headers, admin_headers):
    booking = _completed_booking(client, user_headers, admin_headers, "Hawa Mahal", "RJ14FB0004")
    client.post(f"/api/bookings/{booking['id']}/check-out", headers=user_headers)
    res = client.post(
        f"/api/bookings/{booking['id']}/feedback",
        json={"rating": 4, "issues": ["aliens_took_my_car"]},
        headers=user_headers,
    )
    assert res.status_code == 422
    assert "unknown tag" in res.text.lower()


def test_feedback_can_be_edited_then_blocks_a_second_create(client, user_headers, admin_headers):
    booking = _completed_booking(client, user_headers, admin_headers, "City Palace", "RJ14FB0005")
    client.post(f"/api/bookings/{booking['id']}/check-out", headers=user_headers)
    first = client.post(
        f"/api/bookings/{booking['id']}/feedback",
        json={"rating": 3, "comment": "Fine"},
        headers=user_headers,
    )
    assert first.status_code == 201, first.text

    again = client.post(
        f"/api/bookings/{booking['id']}/feedback",
        json={"rating": 4},
        headers=user_headers,
    )
    assert again.status_code == 409

    edited = client.put(
        f"/api/bookings/{booking['id']}/feedback",
        json={"rating": 5, "comment": "Thought about it, it was great", "highlights": ["clean"]},
        headers=user_headers,
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["rating"] == 5
    assert edited.json()["comment"].endswith("it was great")
    # The reference the driver may already have quoted to care must survive an edit.
    assert edited.json()["reference_code"] == first.json()["reference_code"]


def test_feedback_requires_a_completed_visit(client, user_headers):
    location = _seed_lot(client, "Jal Mahal")
    slot = _first_vacant(client, location["id"])
    start, end = _slot_times()
    booking = client.post(
        "/api/bookings",
        json={
            "slot_id": slot["id"],
            "vehicle_number": "RJ14FB0006",
            "start_time": start,
            "end_time": end,
        },
        headers=user_headers,
    ).json()
    res = client.post(
        f"/api/bookings/{booking['id']}/feedback", json={"rating": 5}, headers=user_headers
    )
    assert res.status_code == 409
    client.post(f"/api/bookings/{booking['id']}/cancel", headers=user_headers)


def test_location_feedback_summary_aggregates(client, user_headers, admin_headers):
    location = _seed_lot(client, "Nahargarh Fort")
    res = client.get(f"/api/locations/{location['id']}/feedback")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["count"] >= 1
    assert 1 <= body["average"] <= 5
    assert sum(body["distribution"].values()) == body["count"]
    # The 2-star report above tagged an occupied bay at this lot.
    assert {tag["id"] for tag in body["top_issues"]} >= {"bay_occupied"}
    # Published comments must stay anonymous.
    assert all("name" not in comment for comment in body["recent"])


def test_admin_feedback_queue_and_triage(client, admin_headers):
    listing = client.get("/api/feedback/admin", headers=admin_headers)
    assert listing.status_code == 200, listing.text
    body = listing.json()
    assert body["total"] >= 3
    assert body["open_high_priority"] >= 1

    high = next(item for item in body["items"] if item["feedback"]["priority"] == "high")
    assert high["holder_email"]
    assert high["holder_phone"]

    triaged = client.patch(
        f"/api/feedback/admin/{high['feedback']['id']}",
        json={"status": "resolved", "operator_note": "Called the driver, bay reassigned"},
        headers=admin_headers,
    )
    assert triaged.status_code == 200, triaged.text
    assert triaged.json()["status"] == "resolved"

    filtered = client.get(
        "/api/feedback/admin", params={"status": "resolved"}, headers=admin_headers
    ).json()
    assert all(item["feedback"]["status"] == "resolved" for item in filtered["items"])


def test_admin_feedback_queue_is_operator_only(client, user_headers):
    assert client.get("/api/feedback/admin", headers=user_headers).status_code == 403
