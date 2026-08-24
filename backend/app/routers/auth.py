"""Signup, login, Google Sign-In, and the current-session endpoint."""
import secrets

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import GOOGLE_ALLOW_DEMO, GOOGLE_CLIENT_ID
from ..database import get_db
from ..models import Role, User
from ..schemas import GoogleIn, LoginIn, SignupIn, TokenOut, UserOut
from ..security import create_token, current_user, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

DEMO_GOOGLE = {
    "email": "google.demo@parkin.app",
    "name": "Kavya Mehta",
    "sub": "demo-google-parkin",
}


def _find_by_email(db: Session, email: str) -> User | None:
    return db.execute(
        select(User).where(func.lower(User.email) == email.strip().lower())
    ).scalar_one_or_none()


def _session(user: User) -> TokenOut:
    return TokenOut(token=create_token(user), user=UserOut.model_validate(user))


def _upsert_google(db: Session, *, email: str, name: str) -> User:
    email = email.strip().lower()
    user = _find_by_email(db, email)
    if user is None:
        user = User(
            email=email,
            name=(name or email.split("@")[0]).strip()[:120] or "Google driver",
            phone="",
            password_hash=hash_password(secrets.token_urlsafe(32)),
            role=Role.USER.value,
            auth_provider="google",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    if user.auth_provider != "google":
        user.auth_provider = "google"
        db.commit()
        db.refresh(user)
    return user


def _google_payload(credential: str) -> dict:
    token = credential.strip()
    if GOOGLE_ALLOW_DEMO and token.lower() in {"demo", "demo-google"}:
        return DEMO_GOOGLE
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google Sign-In is in demo mode. Use Continue with Google, or set GOOGLE_CLIENT_ID.",
        )
    try:
        with httpx.Client(timeout=8.0) as client:
            response = client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": token},
            )
    except httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not reach Google to verify the sign-in"
        )
    if response.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google sign-in was rejected")
    payload = response.json()
    audience = str(payload.get("aud") or "")
    if audience != GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google client mismatch")
    email = str(payload.get("email") or "").strip()
    if not email or payload.get("email_verified") in {"false", False}:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google account has no verified email")
    return {"email": email, "name": str(payload.get("name") or ""), "sub": str(payload.get("sub") or "")}


@router.post("/signup", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupIn, db: Session = Depends(get_db)) -> TokenOut:
    if _find_by_email(db, payload.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That email is already registered. Try logging in instead.",
        )

    user = User(
        email=payload.email.strip().lower(),
        name=payload.name.strip(),
        phone=payload.phone.strip(),
        password_hash=hash_password(payload.password),
        role=Role.USER.value,
        auth_provider="password",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _session(user)


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    user = _find_by_email(db, payload.email)
    if user is None or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password"
        )
    return _session(user)


@router.post("/google", response_model=TokenOut)
def google_login(payload: GoogleIn, db: Session = Depends(get_db)) -> TokenOut:
    identity = _google_payload(payload.credential)
    user = _upsert_google(db, email=identity["email"], name=identity["name"])
    return _session(user)


@router.get("/google-config")
def google_config() -> dict:
    return {"client_id": GOOGLE_CLIENT_ID, "demo": GOOGLE_ALLOW_DEMO}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> UserOut:
    return UserOut.model_validate(user)
