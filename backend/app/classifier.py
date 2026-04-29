"""Subscription email classifier (Lovable AI Gateway)."""
import json
from typing import Any

import httpx
from fastapi import HTTPException

from .config import settings

SYSTEM_PROMPT = """You detect whether an email is about a subscription, SaaS, OTT, mobile app, or recurring billing.

Classify into: FREE_TRIAL_STARTED, TRIAL_ENDING_SOON, PAYMENT_CONFIRMED, SUBSCRIPTION_RENEWAL, NOT_RELEVANT.

Extract: service_name, subscription_type (trial/paid), amount, currency, frequency (monthly/yearly),
next_billing_date (YYYY-MM-DD), trial_end_date (YYYY-MM-DD), cancellation_link, sender_email.

Detect risk_signals from: price_increase, auto_renewal_warning, trial_ending_urgency, failed_payment.

Priority:
- HIGH: payment/renewal within 3 days OR failed payment
- MEDIUM: trial ending soon, price change
- LOW: informational
Use empty string for unknown text fields, empty array for no signals."""

TOOL = {
    "type": "function",
    "function": {
        "name": "classify_subscription_email",
        "parameters": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "enum": [
                        "FREE_TRIAL_STARTED",
                        "TRIAL_ENDING_SOON",
                        "PAYMENT_CONFIRMED",
                        "SUBSCRIPTION_RENEWAL",
                        "NOT_RELEVANT",
                    ],
                },
                "service_name": {"type": "string"},
                "subscription_type": {"type": "string", "enum": ["trial", "paid", ""]},
                "amount": {"type": "string"},
                "currency": {"type": "string"},
                "frequency": {"type": "string", "enum": ["monthly", "yearly", ""]},
                "next_billing_date": {"type": "string"},
                "trial_end_date": {"type": "string"},
                "cancellation_link": {"type": "string"},
                "sender_email": {"type": "string"},
                "priority": {"type": "string", "enum": ["HIGH", "MEDIUM", "LOW"]},
                "risk_signals": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": [
                            "price_increase",
                            "auto_renewal_warning",
                            "trial_ending_urgency",
                            "failed_payment",
                        ],
                    },
                },
            },
            "required": [
                "category", "service_name", "subscription_type", "amount", "currency",
                "frequency", "next_billing_date", "trial_end_date", "cancellation_link",
                "sender_email", "priority", "risk_signals",
            ],
            "additionalProperties": False,
        },
    },
}


async def classify(email_body: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            settings.ai_gateway_url,
            headers={
                "Authorization": f"Bearer {settings.lovable_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.ai_model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Email:\n{email_body[:8000]}"},
                ],
                "tools": [TOOL],
                "tool_choice": {"type": "function", "function": {"name": "classify_subscription_email"}},
            },
        )
    if resp.status_code == 429:
        raise HTTPException(status_code=429, detail="AI rate limit exceeded. Try again shortly.")
    if resp.status_code == 402:
        raise HTTPException(status_code=402, detail="AI credits exhausted. Add funds in Lovable workspace.")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"AI gateway error: {resp.text}")
    data = resp.json()
    try:
        tool_call = data["choices"][0]["message"]["tool_calls"][0]
        return json.loads(tool_call["function"]["arguments"])
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise HTTPException(status_code=502, detail=f"Malformed AI response: {e}")
