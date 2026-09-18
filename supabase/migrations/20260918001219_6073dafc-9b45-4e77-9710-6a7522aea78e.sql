CREATE TABLE public.tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_string text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tokens TO anon, authenticated;
GRANT ALL ON public.tokens TO service_role;
ALTER TABLE public.tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tokens_public_all" ON public.tokens FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.exam_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name text NOT NULL,
  token_used text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_sessions TO anon, authenticated;
GRANT ALL ON public.exam_sessions TO service_role;
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exam_sessions_public_all" ON public.exam_sessions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.cheat_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name text NOT NULL,
  violation_type text NOT NULL,
  "timestamp" timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.cheat_logs TO anon, authenticated;
GRANT ALL ON public.cheat_logs TO service_role;
ALTER TABLE public.cheat_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cheat_logs_public_read" ON public.cheat_logs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "cheat_logs_public_insert" ON public.cheat_logs FOR INSERT TO anon, authenticated WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.cheat_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_sessions;

INSERT INTO public.tokens (token_string, is_active) VALUES
  ('UJIAN2026', true),
  ('MATH-A1', true),
  ('NONAKTIF', false);