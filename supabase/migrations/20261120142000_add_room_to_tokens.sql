-- Add room support to tokens, exam_sessions, and cheat_logs
ALTER TABLE public.tokens 
ADD COLUMN IF NOT EXISTS room text DEFAULT 'Ruang 1';

ALTER TABLE public.exam_sessions 
ADD COLUMN IF NOT EXISTS room text DEFAULT 'Ruang 1';

ALTER TABLE public.cheat_logs 
ADD COLUMN IF NOT EXISTS room text DEFAULT 'Ruang 1';

