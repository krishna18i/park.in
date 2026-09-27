"""Password hashing, JWT issuing, and the auth dependencies."""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
import hmac

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import JWT_ALGORITHM, JWT_EXPIRE_DAYS, JWT_SECRET, SENSOR_INGEST_KEY
from .database import get_db
from .models import Role, User

bearer = HTTPBearer(auto_error=False)

# bcrypt refuses inputs longer than 72 bytes rather than truncating silently.
_MAX_PASSWORD_BYTES = 72


def _prepare(password: str) -> bytes:
    return password.encode("utf-8")[:_MAX_PASSWORD_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prepare(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_prepare(password), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_token(user: User) -> str:
    payload = {
        "sub": user.id,
        "role": user.role,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _unauthorised(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise _unauthorised("Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise _unauthorised("Session expired, please log in again")
    except jwt.InvalidTokenError:
        raise _unauthorised("Invalid token")

    user = db.get(User, payload.get("sub"))
    if user is None:
        raise _unauthorised("User no longer exists")
    return user


def current_admin(user: User = Depends(current_user)) -> User:
    if user.role != Role.ADMIN.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def admin_or_sensor_device(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
    db: Session = Depends(get_db),
) -> str:
    """Accept a provisioned edge-device key or an administrator JWT."""
    if x_device_key and SENSOR_INGEST_KEY and hmac.compare_digest(x_device_key, SENSOR_INGEST_KEY):
        return "device"
    if credentials is None:
        raise _unauthorised("Sensor device key or administrator session required")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise _unauthorised("Session expired, please log in again")
    except jwt.InvalidTokenError:
        raise _unauthorised("Invalid token")
    user = db.get(User, payload.get("sub"))
    if user is None or user.role != Role.ADMIN.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin or sensor access required")
    return "admin"
