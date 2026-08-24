# Park.in

**Smart parking for Jaipur's heritage sites.** Reserve a numbered bay at Hawa Mahal,
City Palace, Jal Mahal or Nahargarh Fort before you leave home, pay in the app, and
show a QR ticket at the gate.

Every bay in the lot repaints live — book one on your phone and it turns amber on the
operator's screen in the same instant.

---

## Run it

Two terminals. No Docker, no database server, no API keys.

**Terminal 1 — API**

```bash
cd backend
python -m venv ../.venv
../.venv/Scripts/python -m pip install -r requirements.txt   # Windows
# source ../.venv/bin/activate && pip install -r requirements.txt   # macOS/Linux
../.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — web app**

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The database creates and seeds itself on first boot —
4 locations, 180 bays, and a few days of booking history.

| Role | Email | Password |
| --- | --- | --- |
| Driver | `demo@parkin.app` | `demo123` |
| Operator | `admin@parkin.app` | `admin123` |

The login screen has one-click buttons for both, so nobody has to type them on stage.

> Reset everything: stop the server, delete `backend/parkin.db`, start it again.

---

## The 90-second demo

1. **Land** on the home page — the badge counts free bays across the city, live.
2. **Pick a lot** → the floor plan draws itself, green bays are free.
3. **Choose a bay**, enter a number plate, set the window. The price updates as you type.
4. **Reserve** → the bay is held for 10 minutes and a countdown starts.
5. **Pay** (UPI / card / cash) → you get a **QR parking pass** with a code like `PKN-7QF3KD`.
6. **Open the operator console in a second window** and paste that code into the gate
   scanner. The bay flips to *occupied* — and if the driver's tab is still open, it
   repaints there without a refresh.
7. **Scan the same code again** → checked out, bay released, back to green everywhere.

The moment worth showing judges is step 6 with two windows side by side.

---

## What it does

**For drivers**
- Live availability per location and per bay
- Pick an exact bay from a floor plan with a drive lane, not a dropdown
- Vehicle number capture, validated (`RJ14 AB 1234` → `RJ14AB1234`)
- Transparent pricing — half-hour blocks, one-hour minimum, quoted before you commit
- QR parking pass, self-service check-in / check-out
- Cancel any time before arrival; the bay frees instantly
- Booking history

**For operators**
- Live occupancy, free bays, revenue today vs. all-time, vehicles currently parked
- **Gate scanner** — one field that checks a vehicle in on the first scan and out on the second
- Create a location and its whole grid of bays in one form
- Manual bay override for maintenance or a driver who left without checking out
- Every booking in one table

**Under the hood**
- Bays are claimed with a conditional `UPDATE`, so two people tapping the same bay at
  the same moment can't both win — the loser gets *"Bay A4 was just taken"*
- A background sweeper releases unpaid holds after 10 minutes, so a demo never
  deadlocks on an abandoned booking
- Deleting a location keeps historical bookings readable and refuses outright while
  vehicles are still parked there

---

## How it's built

```
backend/                 FastAPI + SQLAlchemy + SQLite
  app/
    main.py              app wiring, /ws socket, expiry sweeper
    models.py            tables + the booking state machine
    schemas.py           request/response contracts
    services.py          pricing, atomic bay claim, expiry
    security.py          bcrypt + JWT, auth dependencies
    realtime.py          WebSocket fan-out
    qr.py                QR pass rendering
    seed.py              demo data (fixed RNG seed - same on every laptop)
    routers/             auth, locations, bookings, payments, admin
  tests/test_api.py      22 end-to-end tests

frontend/                React 19 + Vite + Tailwind v4
  src/
    pages/               Home, Login, Signup, Lot, Checkout, Ticket, Dashboard, Admin
    components/          SlotGrid, Navbar, guards, UI primitives
    context/             auth, live socket, toasts
    lib/                 API client, formatting
```

**Booking state machine** — each status owns what happens to the bay:

| Status | Bay | Meaning |
| --- | --- | --- |
| `pending` | reserved | created, awaiting payment, expires after 10 min |
| `confirmed` | reserved | paid, waiting for the driver |
| `active` | occupied | checked in at the gate |
| `completed` | vacant | checked out |
| `cancelled` | vacant | cancelled before arrival |
| `expired` | vacant | never paid for in time |

**Realtime** is a plain WebSocket at `/ws`. The browser connects with the built-in
`new WebSocket(...)` — no Socket.IO, no client library, nothing to mismatch. Messages
are `{ "event": "slot.updated", "payload": { ... } }`.

---

## API

Interactive docs while the server runs: **http://localhost:8000/docs**

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/signup` · `/api/auth/login` | returns JWT + user |
| `GET` | `/api/auth/me` | current session |
| `GET` | `/api/locations` | with live availability counts |
| `GET` | `/api/locations/{id}/slots` | the floor plan |
| `POST` `DELETE` | `/api/locations` · `/api/locations/{id}` | admin |
| `POST` | `/api/bookings` | atomically claims the bay |
| `GET` | `/api/bookings` · `/api/bookings/{id}` | own bookings |
| `GET` | `/api/bookings/{id}/ticket` | QR pass (paid bookings only) |
| `POST` | `/api/bookings/{id}/cancel` · `/check-in` · `/check-out` | |
| `POST` | `/api/payments` | records payment, confirms booking |
| `GET` | `/api/admin/stats` · `/api/admin/bookings` | admin |
| `PATCH` | `/api/admin/slots/{id}` | manual bay override |
| `POST` | `/api/admin/verify-ticket` | gate scan: in, then out |
| `WS` | `/ws` | live bay updates |

---

## Tests

```bash
cd backend
../.venv/Scripts/python -m pytest
```

22 tests covering the full lifecycle, double-booking rejection, cancellation, ticket
gating before payment, role enforcement, pricing rules, and a live WebSocket broadcast.

---

## Deploy

One service. The React bundle is built and handed to the FastAPI process, which
serves it next to the API — so there is a single origin, no CORS to configure,
and no API host compiled into the bundle. `VITE_API_URL` is left unset in the
image and the app addresses its own origin; the WebSocket follows it.

**Render** — `render.yaml` is a blueprint. In the dashboard: **New › Blueprint**,
point it at this repo, apply. It builds the `Dockerfile` and starts the service;
`JWT_SECRET` is generated by Render rather than taken from the dev default.

**Anywhere else** — the image is self-contained and reads `$PORT`:

```bash
docker build -t parkin .
docker run -p 8000:8000 -e JWT_SECRET="$(openssl rand -hex 32)" parkin
```

Open **http://localhost:8000** — app, API and `/docs` all on that one port.

### What the free plan costs you

Render's free instances have no persistent disk and sleep after ~15 minutes
idle. So the SQLite file starts empty on every cold start and re-seeds the demo
data, and the first request after a sleep waits ~30s for the container. That is
the right trade for a demo — the seeded state *is* the demo. For bookings that
survive a restart, move the service to `starter` and attach a disk mounted at
`/app/backend`, which is where `parkin.db` lives.

The scaling limits in **Honest scope** below are unchanged by deploying: one
process holds both the SQLite file and the WebSocket client set, so this runs on
exactly one instance.

---

## Honest scope

This is a hackathon prototype. What's real and what isn't:

- **Payments are simulated.** `_authorise()` in `backend/app/routers/payments.py` always
  succeeds and talks to no one. It's the single seam where Razorpay or Stripe drops in —
  everything downstream already handles a declined result.
- **The gate scanner takes a typed code**, not a camera feed. The ticket carries a real
  scannable QR; wiring a phone camera to the same endpoint is the next step.
- **SQLite, single process.** Right for a laptop demo. Postgres and a shared broker for
  the WebSocket would be the first two changes for real deployment.
- **No SMS/email notifications** and no map/navigation integration yet.

---

## Configuration

Everything has a working default — `.env` is optional. See `backend/.env.example` and
`frontend/.env.example`.

| Variable | Default | |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///parkin.db` | |
| `JWT_SECRET` | dev value | **change before deploying** |
| `RESERVATION_HOLD_MINUTES` | `10` | how long an unpaid bay is held |
| `SEED_ON_STARTUP` | `true` | set `false` for an empty database |
| `VITE_API_URL` | `http://localhost:8000` | frontend → backend; unset in a deployment, where the app uses its own origin |
| `FRONTEND_DIST` | `frontend/dist` | when this exists the API serves the web app too |
| `PORT` | `8000` | read by the container; set for you by Render |
