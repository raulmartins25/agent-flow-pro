CREATE TYPE public.pause_origin AS ENUM ('none', 'ai', 'human');

ALTER TABLE public.conversations 
ADD COLUMN paused_by public.pause_origin NOT NULL DEFAULT 'none';

-- Backfill: conversas atualmente pausadas viram 'ai' por padrão (best-effort)
UPDATE public.conversations 
SET paused_by = 'ai' 
WHERE agent_paused = true;