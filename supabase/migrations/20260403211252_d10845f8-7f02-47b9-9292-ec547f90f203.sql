
CREATE TABLE public.chip_warmups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  api_url text NOT NULL,
  instance_name text,
  token text,
  status text NOT NULL DEFAULT 'connected',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chip_warmups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own chip warmups"
ON public.chip_warmups
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
