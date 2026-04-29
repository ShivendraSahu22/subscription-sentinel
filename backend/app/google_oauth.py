"""Google OAuth 2.0 + Gmail token management."""
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from .config import settings
from .db import GoogleToken
from .security import encrypt, decrypt

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


def build_consent_url(state: str) -> str:
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": f"openid email profile {settings.gmail_scope}",
        "access_type": "offline",  # request refresh_token
        "prompt": "consent",       # force refresh_token on every consent
        "state": state,
        "include_granted_scopes": "true",
    }
    return f"{AUTH_URL}?{urlencode(params)}"


async def exchange_code(code: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {resp.text}")
    return resp.json()


async def fetch_userinfo(access_token: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"})
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch userinfo")
    return resp.json()


def store_tokens(db: Session, user_id: str, token_payload: dict) -> None:
    expires_at = datetime.utcnow() + timedelta(seconds=int(token_payload.get("expires_in", 3600)))
    row: Optional[GoogleToken] = db.get(GoogleToken, user_id)
    refresh = token_payload.get("refresh_token")
    if row is None:
        row = GoogleToken(
            user_id=user_id,
            access_token_enc=encrypt(token_payload["access_token"]),
            refresh_token_enc=encrypt(refresh) if refresh else None,
            expires_at=expires_at,
            scope=token_payload.get("scope", settings.gmail_scope),
        )
        db.add(row)
    else:
        row.access_token_enc = encrypt(token_payload["access_token"])
        if refresh:  # Google omits refresh_token on subsequent consents
            row.refresh_token_enc = encrypt(refresh)
        row.expires_at = expires_at
        row.scope = token_payload.get("scope", row.scope)
    db.commit()


async def get_valid_access_token(db: Session, user_id: str) -> str:
    row: Optional[GoogleToken] = db.get(GoogleToken, user_id)
    if row is None:
        raise HTTPException(status_code=401, detail="No Google tokens stored. Please sign in.")
    # Refresh if expiring within 60 seconds
    if row.expires_at - datetime.utcnow() > timedelta(seconds=60):
        return decrypt(row.access_token_enc)
    if not row.refresh_token_enc:
        raise HTTPException(status_code=401, detail="Access token expired and no refresh token available.")
    refresh_token = decrypt(row.refresh_token_enc)
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            TOKEN_URL,
            data={
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail=f"Refresh failed: {resp.text}")
    payload = resp.json()
    row.access_token_enc = encrypt(payload["access_token"])
    row.expires_at = datetime.utcnow() + timedelta(seconds=int(payload.get("expires_in", 3600)))
    db.commit()
    return payload["access_token"]
