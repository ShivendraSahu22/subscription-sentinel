"""FastAPI entrypoint — Google OAuth + Gmail + AI subscription classifier."""
import json
import secrets
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .classifier import classify
from .config import settings
from .db import Classification, User, get_db, init_db
from .gmail import SUBSCRIPTION_QUERY, get_message, list_message_ids
from .google_oauth import (
    build_consent_url,
    exchange_code,
    fetch_userinfo,
    get_valid_access_token,
    store_tokens,
)
from .security import SESSION_COOKIE, current_user, issue_session

app = FastAPI(title="Subscription Email AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    init_db()


@app.get("/healthz")
def healthz():
    return {"ok": True}


# ---------- AUTH ----------

# In-memory CSRF state store. For multi-instance deployments swap for Redis.
_oauth_states: set[str] = set()


@app.get("/auth/login")
def auth_login():
    state = secrets.token_urlsafe(24)
    _oauth_states.add(state)
    return RedirectResponse(url=build_consent_url(state))


@app.get("/auth/callback")
async def auth_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db),
):
    if state not in _oauth_states:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    _oauth_states.discard(state)

    token_payload = await exchange_code(code)
    userinfo = await fetch_userinfo(token_payload["access_token"])
    user_id = userinfo["sub"]
    email = userinfo.get("email", "")

    user = db.get(User, user_id)
    if user is None:
        db.add(User(id=user_id, email=email))
    store_tokens(db, user_id, token_payload)

    response = RedirectResponse(url=f"{settings.frontend_url}/?auth=ok")
    response.set_cookie(
        key=SESSION_COOKIE,
        value=issue_session(user_id, email),
        httponly=True,
        secure=settings.frontend_url.startswith("https"),
        samesite="lax",
        max_age=60 * 60 * 24 * 7,
        path="/",
    )
    return response


@app.post("/auth/logout")
def auth_logout(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


# ---------- EMAILS ----------

class FetchResponse(BaseModel):
    count: int
    emails: list[dict]


@app.get("/emails/fetch", response_model=FetchResponse)
async def emails_fetch(
    max_emails: int = Query(20, ge=1, le=100),
    query: Optional[str] = Query(None, description="Override default subscription query"),
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    access_token = await get_valid_access_token(db, user["id"])
    ids = await list_message_ids(access_token, query or SUBSCRIPTION_QUERY, max_emails)
    emails = [await get_message(access_token, mid) for mid in ids]
    return {"count": len(emails), "emails": emails}


class AnalyzeIn(BaseModel):
    max_emails: int = Field(default=20, ge=1, le=100)
    query: Optional[str] = None
    only_relevant: bool = True


class AnalyzeOut(BaseModel):
    scanned: int
    saved: int
    results: list[dict]


@app.post("/emails/analyze", response_model=AnalyzeOut)
async def emails_analyze(
    payload: AnalyzeIn,
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    access_token = await get_valid_access_token(db, user["id"])
    ids = await list_message_ids(access_token, payload.query or SUBSCRIPTION_QUERY, payload.max_emails)

    results: list[dict] = []
    saved = 0
    for mid in ids:
        msg = await get_message(access_token, mid)
        composed = f"From: {msg['from']}\nSubject: {msg['subject']}\n\n{msg['body']}"
        try:
            result = await classify(composed)
        except HTTPException:
            continue

        if payload.only_relevant and result.get("category") == "NOT_RELEVANT":
            continue

        # Upsert by (user_id, message_id)
        existing = (
            db.query(Classification)
            .filter_by(user_id=user["id"], message_id=mid)
            .one_or_none()
        )
        if existing is None:
            db.add(Classification(
                user_id=user["id"],
                message_id=mid,
                category=result["category"],
                service_name=result.get("service_name") or None,
                subscription_type=result.get("subscription_type") or None,
                amount=result.get("amount") or None,
                currency=result.get("currency") or None,
                frequency=result.get("frequency") or None,
                next_billing_date=result.get("next_billing_date") or None,
                trial_end_date=result.get("trial_end_date") or None,
                cancellation_link=result.get("cancellation_link") or None,
                sender_email=result.get("sender_email") or msg["from"],
                priority=result.get("priority") or None,
                risk_signals=json.dumps(result.get("risk_signals") or []),
                email_snippet=msg["snippet"],
            ))
            saved += 1
        results.append({"message_id": mid, **result})

    db.commit()
    return {"scanned": len(ids), "saved": saved, "results": results}


@app.get("/emails/classifications")
def list_classifications(
    user=Depends(current_user),
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
):
    rows = (
        db.query(Classification)
        .filter_by(user_id=user["id"])
        .order_by(Classification.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "message_id": r.message_id,
            "category": r.category,
            "service_name": r.service_name,
            "subscription_type": r.subscription_type,
            "amount": r.amount,
            "currency": r.currency,
            "frequency": r.frequency,
            "next_billing_date": r.next_billing_date,
            "trial_end_date": r.trial_end_date,
            "cancellation_link": r.cancellation_link,
            "sender_email": r.sender_email,
            "priority": r.priority,
            "risk_signals": json.loads(r.risk_signals or "[]"),
            "email_snippet": r.email_snippet,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]
