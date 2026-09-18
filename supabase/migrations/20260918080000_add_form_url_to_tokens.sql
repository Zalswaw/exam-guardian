ALTER TABLE public.tokens 
ADD COLUMN IF NOT EXISTS form_url text,
ADD COLUMN IF NOT EXISTS exam_title text;
