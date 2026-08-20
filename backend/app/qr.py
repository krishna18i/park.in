"""QR ticket rendering."""
import base64
from io import BytesIO

import qrcode


def qr_data_uri(payload: str) -> str:
    """Render `payload` as a PNG QR code embedded as a data URI.

    Returned inline so the ticket needs no extra request and no file storage --
    the image tag itself is the ticket.
    """
    code = qrcode.QRCode(version=None, box_size=10, border=2)
    code.add_data(payload)
    code.make(fit=True)
    image = code.make_image(fill_color="#1c1917", back_color="white")

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"
