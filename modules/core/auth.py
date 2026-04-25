"""
auth.py — JWT creation/validation + password hashing + Google token verification
"""
import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

log = logging.getLogger("auth")

SECRET_KEY = os.getenv("JWT_SECRET", "changeme-set-JWT_SECRET-in-env")
ALGORITHM  = "HS256"
TOKEN_EXPIRE_HOURS = 24

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


def create_token(user_id: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode(
        {"sub": user_id, "email": email, "exp": expire},
        SECRET_KEY, algorithm=ALGORITHM,
    )


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def verify_google_token(credential: str) -> Optional[dict]:
    """Verify a Google ID token. Returns the payload dict or None."""
    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    if not client_id:
        log.warning("GOOGLE_CLIENT_ID not set — Google login disabled")
        return None
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests
        info = google_id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            client_id,
        )
        return info  # has 'sub', 'email', 'name', 'picture', etc.
    except Exception as exc:
        log.warning(f"Google token verification failed: {exc}")
        return None
