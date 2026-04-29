ALTER TABLE public.classifications
  ADD COLUMN IF NOT EXISTS subscription_type text,
  ADD COLUMN IF NOT EXISTS next_billing_date text,
  ADD COLUMN IF NOT EXISTS cancellation_link text,
  ADD COLUMN IF NOT EXISTS sender_email text,
  ADD COLUMN IF NOT EXISTS priority text,
  ADD COLUMN IF NOT EXISTS risk_signals text[];