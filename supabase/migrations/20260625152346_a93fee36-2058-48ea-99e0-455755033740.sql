
CREATE TABLE public.warmup_evolution_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  evolution_api_url text NOT NULL,
  instance_name text NOT NULL,
  evolution_api_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warmup_evolution_instances TO authenticated;
GRANT ALL ON public.warmup_evolution_instances TO service_role;

ALTER TABLE public.warmup_evolution_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own warmup evolution instances"
ON public.warmup_evolution_instances
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_warmup_evo_updated
BEFORE UPDATE ON public.warmup_evolution_instances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
