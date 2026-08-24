"""Runtime configuration. Everything has a working default so the app boots
with zero setup -- .env is optional, not required."""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# SQLite lives next to the backend package. No server, no Docker, no URI to configure.
DEFAULT_DB = (BASE_DIR / "parkin.db").as_posix()
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB}")

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = int(os.getenv("JWT_EXPIRE_DAYS", "7"))

CORS_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"
    ).split(",")
    if o.strip()
]

# An unpaid booking holds its slot this long, then the slot is released
# automatically. Keeps a live demo from deadlocking on abandoned bookings.
RESERVATION_HOLD_MINUTES = int(os.getenv("RESERVATION_HOLD_MINUTES", "10"))
EXPIRY_SWEEP_SECONDS = int(os.getenv("EXPIRY_SWEEP_SECONDS", "20"))

SEED_ON_STARTUP = os.getenv("SEED_ON_STARTUP", "true").lower() in {"1", "true", "yes"}

# The built web app. When this directory exists the API also serves the React
# bundle, so a deployment is one process on one origin -- no CORS, no API host
# compiled into the bundle. It is absent in development, where Vite serves the
# frontend on :5173 and talks to this API across the CORS_ORIGINS list above.
FRONTEND_DIST = Path(
    os.getenv("FRONTEND_DIST", str(BASE_DIR.parent / "frontend" / "dist"))
).resolve()

# Razorpay is optional. Without keys the checkout stays simulated so a laptop
# demo never needs a merchant account.
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "").strip()
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
RAZORPAY_ENABLED = bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)

# Google Sign-In. With no client id the login screen still offers a demo
# Google path so the SIH poster works on a laptop with zero cloud setup.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_ALLOW_DEMO = os.getenv("GOOGLE_ALLOW_DEMO", "true").lower() in {"1", "true", "yes"}

# Optional Maps key. Destination search uses Google Geocoding + Places when set,
# otherwise OpenStreetMap (Photon / Nominatim) biased to Jaipur.
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
