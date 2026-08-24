"""Thin Razorpay REST client. Stdlib only so the prototype stays key-optional."""
import base64
import hashlib
import hmac
import json
import logging
import urllib.error
import urllib.request

from .config import RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET

logger = logging.getLogger(__name__)

_ORDERS_URL = "https://api.razorpay.com/v1/orders"


def _auth_header() -> str:
    token = base64.b64encode(f"{RAZORPAY_KEY_ID}:{RAZORPAY_KEY_SECRET}".encode()).decode()
    return f"Basic {token}"


def create_order(*, amount_rupees: float, receipt: str) -> dict:
    """Create a Razorpay order. Amount is sent in paise as required by the API."""
    paise = int(round(amount_rupees * 100))
    body = json.dumps(
        {"amount": paise, "currency": "INR", "receipt": receipt[:40], "payment_capture": 1}
    ).encode()
    request = urllib.request.Request(
        _ORDERS_URL,
        data=body,
        method="POST",
        headers={
            "Authorization": _auth_header(),
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        logger.warning("razorpay order failed: %s %s", error.code, detail)
        raise RuntimeError("Razorpay could not create an order") from error
    except urllib.error.URLError as error:
        logger.warning("razorpay unreachable: %s", error)
        raise RuntimeError("Cannot reach Razorpay") from error


def verify_signature(order_id: str, payment_id: str, signature: str) -> bool:
    expected = hmac.new(
        RAZORPAY_KEY_SECRET.encode(),
        f"{order_id}|{payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
