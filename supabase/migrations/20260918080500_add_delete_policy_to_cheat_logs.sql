GRANT DELETE ON public.cheat_logs TO anon, authenticated;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cheat_logs' AND policyname = 'cheat_logs_public_delete'
  ) THEN
    CREATE POLICY "cheat_logs_public_delete" ON public.cheat_logs FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $$;
