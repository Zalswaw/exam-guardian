-- ====================================================================
-- MIGRASI WAJIB SUPABASE: FORM URL, EXAM TITLE, ROOM & REALTIME PERMISSIONS
-- Jalankan skrip ini di: Supabase Dashboard -> SQL Editor -> Run
-- ====================================================================

-- 1. Tambahkan kolom form_url, exam_title, dan room ke tabel tokens
ALTER TABLE public.tokens 
ADD COLUMN IF NOT EXISTS form_url text,
ADD COLUMN IF NOT EXISTS exam_title text,
ADD COLUMN IF NOT EXISTS room text DEFAULT 'Ruang 1';

-- 2. Tambahkan kolom room ke tabel cheat_logs (untuk pencatatan pelanggaran per ruang)
ALTER TABLE public.cheat_logs 
ADD COLUMN IF NOT EXISTS room text;

-- 3. Beri hak akses lengkap ke anon dan authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tokens TO anon, authenticated;
GRANT ALL ON public.tokens TO service_role;

GRANT SELECT, INSERT, DELETE ON public.cheat_logs TO anon, authenticated;
GRANT ALL ON public.cheat_logs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_sessions TO anon, authenticated;
GRANT ALL ON public.exam_sessions TO service_role;

-- 4. Aktifkan policy delete cheat_logs (agar tombol hapus riwayat berfungsi)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cheat_logs' AND policyname = 'cheat_logs_public_delete'
  ) THEN
    CREATE POLICY "cheat_logs_public_delete" ON public.cheat_logs FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $$;

-- 5. Beri tahu PostgREST untuk me-reload schema cache seketika
NOTIFY pgrst, 'reload schema';
