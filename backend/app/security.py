"""Token encryption + session JWT helpers."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from cryptography.fernet import Fernet
from fastapi import Cookie, HTTPException, status
from jose import JWTError, jwt

from .config import settings

_fernet = Fernet(settings.token_encryption_key.encode())

JWT_ALG = "HS256"
SESSION_COOKIE = "sea_session"
SESSION_TTL_HOURS = 24 * 7


def encrypt(value: str) -> bytes:
    return _fernet.encrypt(value.encode())


def decrypt(value: bytes) -> str:
    return _fernet.decrypt(value).decode()


def issue_session(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(tz=timezone.utc) + timedelta(hours=SESSION_TTL_HOURS),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALG)


def current_user(session: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE)) -> dict:
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = jwt.decode(session, settings.jwt_secret, algorithms=[JWT_ALG])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    return {"id": payload["sub"], "email": payload["email"]}
