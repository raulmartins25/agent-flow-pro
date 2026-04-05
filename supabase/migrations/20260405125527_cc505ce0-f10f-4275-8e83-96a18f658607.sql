
-- Enum para status do device
CREATE TYPE device_status AS ENUM ('disconnected', 'connecting', 'connected', 'error');

-- Tabela devices
CREATE TABLE public.devices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  evolution_api_url text NOT NULL,
  evolution_api_key text NOT NULL,
  instance_name text NOT NULL,
  phone_number text,
  status device_status NOT NULL DEFAULT 'disconnected',
  qr_code text,
  last_connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own devices" ON public.devices FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Adicionar device_id aos agents
ALTER TABLE public.agents ADD COLUMN device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL;

-- Adicionar device_id e instance_name às conversations
ALTER TABLE public.conversations ADD COLUMN device_id uuid REFERENCES public.devices(id);
ALTER TABLE public.conversations ADD COLUMN instance_name text;

-- Remover colunas Evolution dos agents (agora vêm do device)
ALTER TABLE public.agents DROP COLUMN IF EXISTS evolution_api_url;
ALTER TABLE public.agents DROP COLUMN IF EXISTS evolution_api_key;
ALTER TABLE public.agents DROP COLUMN IF EXISTS evolution_instance;
