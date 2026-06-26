
-- ============================================================
-- 1) Move SECURITY DEFINER helpers to a private schema
-- ============================================================
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION private.user_can_access_device(_user uuid, _device uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.devices WHERE id = _device AND user_id = _user)
      OR EXISTS (SELECT 1 FROM public.client_device_access WHERE user_id = _user AND device_id = _device);
$$;

REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.user_can_access_device(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.user_can_access_device(uuid, uuid) TO authenticated, service_role;

-- ============================================================
-- 2) Recreate policies referencing the helpers via private.*
-- ============================================================
DROP POLICY IF EXISTS "Users select appointments" ON public.appointments;
CREATE POLICY "Users select appointments" ON public.appointments FOR SELECT
  USING (auth.uid() = user_id OR (device_id IS NOT NULL AND private.user_can_access_device(auth.uid(), device_id)));

DROP POLICY IF EXISTS "Users select conversations" ON public.conversations;
CREATE POLICY "Users select conversations" ON public.conversations FOR SELECT
  USING ((EXISTS (SELECT 1 FROM public.agents WHERE agents.id = conversations.agent_id AND agents.user_id = auth.uid()))
         OR (device_id IS NOT NULL AND private.user_can_access_device(auth.uid(), device_id)));

DROP POLICY IF EXISTS "Users update conversations" ON public.conversations;
CREATE POLICY "Users update conversations" ON public.conversations FOR UPDATE
  USING ((EXISTS (SELECT 1 FROM public.agents WHERE agents.id = conversations.agent_id AND agents.user_id = auth.uid()))
         OR (device_id IS NOT NULL AND private.user_can_access_device(auth.uid(), device_id)))
  WITH CHECK ((EXISTS (SELECT 1 FROM public.agents WHERE agents.id = conversations.agent_id AND agents.user_id = auth.uid()))
         OR (device_id IS NOT NULL AND private.user_can_access_device(auth.uid(), device_id)));

DROP POLICY IF EXISTS "Clients can view agents of granted devices" ON public.agents;
CREATE POLICY "Clients can view agents of granted devices" ON public.agents FOR SELECT
  USING (device_id IS NOT NULL AND private.user_can_access_device(auth.uid(), device_id));

DROP POLICY IF EXISTS "Users select own or granted devices" ON public.devices;
CREATE POLICY "Users select own or granted devices" ON public.devices FOR SELECT
  USING (auth.uid() = user_id OR private.user_can_access_device(auth.uid(), id));

DROP POLICY IF EXISTS "Users select messages" ON public.messages;
CREATE POLICY "Users select messages" ON public.messages FOR SELECT
  USING ((EXISTS (SELECT 1 FROM public.conversations c JOIN public.agents a ON a.id = c.agent_id WHERE c.id = messages.conversation_id AND a.user_id = auth.uid()))
      OR (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND c.device_id IS NOT NULL AND private.user_can_access_device(auth.uid(), c.device_id))));

DROP POLICY IF EXISTS "Users insert messages" ON public.messages;
CREATE POLICY "Users insert messages" ON public.messages FOR INSERT
  WITH CHECK ((EXISTS (SELECT 1 FROM public.conversations c JOIN public.agents a ON a.id = c.agent_id WHERE c.id = messages.conversation_id AND a.user_id = auth.uid()))
      OR (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND c.device_id IS NOT NULL AND private.user_can_access_device(auth.uid(), c.device_id))));

DROP POLICY IF EXISTS "Admins manage access" ON public.client_device_access;
CREATE POLICY "Admins manage access" ON public.client_device_access FOR ALL
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Users can view own access" ON public.client_device_access;
CREATE POLICY "Users can view own access" ON public.client_device_access FOR SELECT
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::public.app_role));

-- Drop public-schema versions so the linter stops flagging them
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.user_can_access_device(uuid, uuid);

-- ============================================================
-- 3) Column-level restriction for sensitive columns
-- ============================================================
REVOKE SELECT ON public.agents FROM authenticated, anon;
GRANT SELECT (
  id, user_id, name, type, status, transfer_number, transfer_trigger,
  llm_provider, llm_model, followup_start_message, followup_max,
  followup_interval_minutes, restrictions, created_at, updated_at,
  device_id, custom_prompt_enabled
) ON public.agents TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.agents TO authenticated;

REVOKE SELECT ON public.devices FROM authenticated, anon;
GRANT SELECT (
  id, user_id, name, instance_name, phone_number, status, qr_code,
  created_at, last_connected_at
) ON public.devices TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.devices TO authenticated;

REVOKE SELECT ON public.chip_warmups FROM authenticated, anon;
GRANT SELECT (id, user_id, provider, instance_name, status, api_url, created_at)
  ON public.chip_warmups TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.chip_warmups TO authenticated;

-- ============================================================
-- 4) Owner-only RPC to read agent secrets when needed
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_owner_agent_secrets(_agent_id uuid)
RETURNS TABLE(llm_api_key text, prompt_compiled text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.llm_api_key, a.prompt_compiled
  FROM public.agents a
  WHERE a.id = _agent_id AND a.user_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.get_owner_agent_secrets(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_owner_agent_secrets(uuid) TO authenticated;

-- ============================================================
-- 5) simulator_shares: remove public read
-- ============================================================
DROP POLICY IF EXISTS "Anyone can read valid shares" ON public.simulator_shares;

-- ============================================================
-- 6) Storage policies: scope agent-media by user folder
-- ============================================================
DROP POLICY IF EXISTS "Authenticated upload agent-media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete agent-media" ON storage.objects;
DROP POLICY IF EXISTS "Public read agent-media" ON storage.objects;

CREATE POLICY "Users upload to own folder agent-media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'agent-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update own folder agent-media" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'agent-media' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'agent-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own folder agent-media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'agent-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Public read agent-media files" ON storage.objects FOR SELECT
  USING (bucket_id = 'agent-media' AND name LIKE '%/%');
