CREATE TABLE public.classifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email_body TEXT NOT NULL,
  category TEXT NOT NULL,
  service_name TEXT,
  trial_end_date TEXT,
  amount TEXT,
  currency TEXT,
  frequency TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view classifications"
  ON public.classifications FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create classifications"
  ON public.classifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can delete classifications"
  ON public.classifications FOR DELETE
  USING (true);

CREATE INDEX idx_classifications_created_at ON public.classifications(created_at DESC);