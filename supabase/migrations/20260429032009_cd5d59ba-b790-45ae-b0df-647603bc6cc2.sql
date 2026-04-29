
-- Explicit "deny all" so the intent is documented and the linter is satisfied.
-- service_role bypasses RLS and is unaffected.
DROP POLICY IF EXISTS "Deny all client access to google_tokens" ON public.google_tokens;
CREATE POLICY "Deny all client access to google_tokens"
  ON public.google_tokens
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
