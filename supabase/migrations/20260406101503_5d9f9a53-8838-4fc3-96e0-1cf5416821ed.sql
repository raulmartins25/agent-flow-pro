ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS prospecting_messages jsonb;
ALTER TABLE public.blast_contacts ADD COLUMN IF NOT EXISTS metadata jsonb;