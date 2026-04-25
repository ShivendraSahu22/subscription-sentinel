-- 1. Add user_id to existing classifications table and lock down RLS
ALTER TABLE public.classifications
  ADD COLUMN IF NOT EXISTS user_id uuid;

-- Drop old permissive policies
DROP POLICY IF EXISTS "Anyone can create classifications" ON public.classifications;
DROP POLICY IF EXISTS "Anyone can delete classifications" ON public.classifications;
DROP POLICY IF EXISTS "Anyone can view classifications" ON public.classifications;

-- New per-user policies
CREATE POLICY "Users view own classifications"
  ON public.classifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own classifications"
  ON public.classifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own classifications"
  ON public.classifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own classifications"
  ON public.classifications FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_classifications_user ON public.classifications(user_id, created_at DESC);

-- 2. Reminders table (one row per classification + type)
CREATE TABLE public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  classification_id uuid NOT NULL REFERENCES public.classifications(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('upcoming', 'last_day')),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own reminders"
  ON public.reminders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own reminders"
  ON public.reminders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own reminders"
  ON public.reminders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own reminders"
  ON public.reminders FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_reminders_classification ON public.reminders(classification_id, type);

-- 3. Decisions table (KEEP/CANCEL/ASK_USER)
CREATE TABLE public.decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  classification_id uuid NOT NULL REFERENCES public.classifications(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('KEEP', 'CANCEL', 'ASK_USER')),
  reason text NOT NULL,
  usage text,
  preference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own decisions"
  ON public.decisions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own decisions"
  ON public.decisions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own decisions"
  ON public.decisions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own decisions"
  ON public.decisions FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_decisions_classification ON public.decisions(classification_id, created_at DESC);

-- 4. Cancellation suggestions table
CREATE TABLE public.cancellation_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  classification_id uuid NOT NULL REFERENCES public.classifications(id) ON DELETE CASCADE,
  suggestion text NOT NULL,
  usage text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cancellation_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own cancellation_suggestions"
  ON public.cancellation_suggestions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own cancellation_suggestions"
  ON public.cancellation_suggestions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own cancellation_suggestions"
  ON public.cancellation_suggestions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own cancellation_suggestions"
  ON public.cancellation_suggestions FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_cancellation_suggestions_classification ON public.cancellation_suggestions(classification_id, created_at DESC);

-- 5. Summary snapshots
CREATE TABLE public.summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  summary text NOT NULL,
  classifications_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own summaries"
  ON public.summaries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own summaries"
  ON public.summaries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own summaries"
  ON public.summaries FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_summaries_user ON public.summaries(user_id, created_at DESC);
