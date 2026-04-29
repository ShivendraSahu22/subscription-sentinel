
-- Required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Table: encrypted Google tokens, one row per user
CREATE TABLE IF NOT EXISTS public.google_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token_enc bytea NOT NULL,
  refresh_token_enc bytea,
  expires_at timestamptz NOT NULL,
  scope text NOT NULL DEFAULT 'https://www.googleapis.com/auth/gmail.readonly',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_tokens ENABLE ROW LEVEL SECURITY;

-- Lock down the table: NO client policies. Only service_role bypass-RLS may touch rows.
REVOKE ALL ON public.google_tokens FROM anon, authenticated;

-- Upsert helper: callable only by service_role from edge functions
CREATE OR REPLACE FUNCTION public.upsert_google_token(
  p_user_id uuid,
  p_access_token text,
  p_refresh_token text,
  p_expires_at timestamptz,
  p_scope text,
  p_secret text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.google_tokens (user_id, access_token_enc, refresh_token_enc, expires_at, scope)
  VALUES (
    p_user_id,
    pgp_sym_encrypt(p_access_token, p_secret),
    CASE WHEN p_refresh_token IS NOT NULL AND p_refresh_token <> ''
         THEN pgp_sym_encrypt(p_refresh_token, p_secret) END,
    p_expires_at,
    COALESCE(p_scope, 'https://www.googleapis.com/auth/gmail.readonly')
  )
  ON CONFLICT (user_id) DO UPDATE SET
    access_token_enc = EXCLUDED.access_token_enc,
    -- keep existing refresh token if Google omitted it on this consent
    refresh_token_enc = COALESCE(EXCLUDED.refresh_token_enc, public.google_tokens.refresh_token_enc),
    expires_at = EXCLUDED.expires_at,
    scope = EXCLUDED.scope,
    updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_google_token(uuid, text, text, timestamptz, text, text) FROM anon, authenticated, public;

-- Read helper for a single user (server-side only)
CREATE OR REPLACE FUNCTION public.get_google_token(p_user_id uuid, p_secret text)
RETURNS TABLE(access_token text, refresh_token text, expires_at timestamptz, scope text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pgp_sym_decrypt(t.access_token_enc, p_secret),
    CASE WHEN t.refresh_token_enc IS NOT NULL THEN pgp_sym_decrypt(t.refresh_token_enc, p_secret) END,
    t.expires_at,
    t.scope
  FROM public.google_tokens t
  WHERE t.user_id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_google_token(uuid, text) FROM anon, authenticated, public;

-- List all users that have a refresh token (for the scheduled job)
CREATE OR REPLACE FUNCTION public.list_users_with_refresh_token(p_secret text)
RETURNS TABLE(user_id uuid, access_token text, refresh_token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.user_id,
    pgp_sym_decrypt(t.access_token_enc, p_secret),
    pgp_sym_decrypt(t.refresh_token_enc, p_secret),
    t.expires_at
  FROM public.google_tokens t
  WHERE t.refresh_token_enc IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.list_users_with_refresh_token(text) FROM anon, authenticated, public;
