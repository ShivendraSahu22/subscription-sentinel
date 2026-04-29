# Subscription Email AI – FastAPI backend

Standalone Python service that mirrors the in-app Lovable Cloud flow.
Deploy it on Render, Fly.io, Railway, Docker, or any host that runs Python 3.11+.

## Endpoints

| Method | Path               | Purpose                                                  |
| ------ | ------------------ | -------------------------------------------------------- |
| GET    | `/auth/login`      | Redirect to Google OAuth consent (Gmail readonly scope)  |
| GET    | `/auth/callback`   | Exchange code → access + refresh tokens, store encrypted |
| GET    | `/emails/fetch`    | Fetch & filter Gmail messages for a user                 |
| POST   | `/emails/analyze`  | Run AI subscription classifier on fetched emails         |
| GET    | `/healthz`         | Health check                                             |

Tokens are encrypted at rest with **Fernet (AES-128-CBC + HMAC)** using
`TOKEN_ENCRYPTION_KEY`. Refresh tokens are used server-side to mint new access
tokens — users do **not** need to be online for `/emails/fetch` to work.

## Setup

```bash
cd backend
python -m pip install --no-cache-dir -r requirements.txt
cp .env.example .env   # fill in values
python -m uvicorn app.main:app --reload --port 8000
```

### Required environment variables

| Var                       | Where to get it                                                       |
| ------------------------- | --------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`        | Google Cloud Console → APIs & Services → Credentials                  |
| `GOOGLE_CLIENT_SECRET`    | same                                                                  |
| `GOOGLE_REDIRECT_URI`     | e.g. `https://api.yourdomain.com/auth/callback` (must match in GCP)   |
| `LOVABLE_API_KEY`         | Lovable AI Gateway key (from your Lovable workspace)                  |
| `TOKEN_ENCRYPTION_KEY`    | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `DATABASE_URL`            | Postgres URL (e.g. Supabase / Neon). SQLite default for local dev.    |
| `FRONTEND_URL`            | Where to bounce the user after OAuth success                          |
| `JWT_SECRET`              | Random 32+ byte string for the session JWT                            |

### Google Cloud setup

1. Enable the **Gmail API**.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Add `GOOGLE_REDIRECT_URI` under **Authorized redirect URIs**.
4. On the OAuth consent screen, add scope:
   `https://www.googleapis.com/auth/gmail.readonly`

## Flow

```
Browser ── GET /auth/login ──▶ Google consent
   ◀── redirect with ?code=… ── 
GET /auth/callback ─▶ exchange code, encrypt + store tokens, set session cookie
GET /emails/fetch  ─▶ refresh access token if needed, list+get Gmail messages
POST /emails/analyze ─▶ classify each email via Lovable AI Gateway, persist results
```
