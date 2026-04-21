CREATE TABLE public.agent_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  provider text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, provider)
);

CREATE INDEX idx_agent_integrations_agent ON public.agent_integrations(agent_id);

ALTER TABLE public.agent_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own agent integrations"
ON public.agent_integrations
FOR ALL
USING (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_integrations.agent_id AND a.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_integrations.agent_id AND a.user_id = auth.uid()));

CREATE TRIGGER update_agent_integrations_updated_at
BEFORE UPDATE ON public.agent_integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();