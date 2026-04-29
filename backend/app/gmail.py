"""Gmail API helpers (list + get + decode)."""
import base64
from typing import Any

import httpx
from fastapi import HTTPException

GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"
SUBSCRIPTION_QUERY = (
    'newer_than:365d (subscription OR receipt OR invoice OR "free trial" '
    'OR "trial ends" OR "renews" OR "payment confirmed" OR "billed")'
)


def _b64url_decode(data: str) -> str:
    padded = data + "=" * (-len(data) % 4)
    try:
        return base64.urlsafe_b64decode(padded.encode()).decode("utf-8", errors="replace")
    except Exception:
        return ""


def _extract_text(payload: dict[str, Any]) -> str:
    if not payload:
        return ""
    if payload.get("body", {}).get("data"):
        decoded = _b64url_decode(payload["body"]["data"])
        if decoded:
            return decoded
    for part in payload.get("parts", []) or []:
        if part.get("mimeType") == "text/plain" and part.get("body", {}).get("data"):
            return _b64url_decode(part["body"]["data"])
    for part in payload.get("parts", []) or []:
        nested = _extract_text(part)
        if nested:
            return nested
    for part in payload.get("parts", []) or []:
        if part.get("mimeType") == "text/html" and part.get("body", {}).get("data"):
            html = _b64url_decode(part["body"]["data"])
            return "".join(c for c in html if c != "<" and c != ">")  # crude strip
    return ""


def _header(headers: list[dict], name: str) -> str:
    for h in headers or []:
        if (h.get("name") or "").lower() == name.lower():
            return h.get("value") or ""
    return ""


async def list_message_ids(access_token: str, query: str, max_results: int) -> list[str]:
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            f"{GMAIL_BASE}/messages",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"q": query, "maxResults": min(max_results, 100)},
        )
    if resp.status_code in (401, 403):
        raise HTTPException(status_code=401, detail="Gmail access denied — reconnect your Google account.")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Gmail list error: {resp.text}")
    return [m["id"] for m in resp.json().get("messages", [])]


async def get_message(access_token: str, msg_id: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            f"{GMAIL_BASE}/messages/{msg_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"format": "full"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Gmail get error for {msg_id}: {resp.text}")
    msg = resp.json()
    headers = msg.get("payload", {}).get("headers", [])
    return {
        "id": msg["id"],
        "subject": _header(headers, "Subject"),
        "from": _header(headers, "From"),
        "date": _header(headers, "Date"),
        "body": _extract_text(msg.get("payload", {}))[:5000],
        "snippet": msg.get("snippet", ""),
    }
