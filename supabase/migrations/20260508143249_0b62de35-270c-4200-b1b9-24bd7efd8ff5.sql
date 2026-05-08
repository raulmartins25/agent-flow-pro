
-- 1) Tabela de acesso cliente -> device
CREATE TABLE public.client_device_access (
  user_id uuid NOT NULL,
  device_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id)
);

ALTER TABLE public.client_device_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own access"
ON public.client_device_access FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage access"
ON public.client_device_access FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) Helper function
CREATE OR REPLACE FUNCTION public.user_can_access_device(_user uuid, _device uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.devices WHERE id = _device AND user_id = _user)
      OR EXISTS (SELECT 1 FROM public.client_device_access WHERE user_id = _user AND device_id = _device);
$$;

-- 3) Devices: permitir SELECT se for client com acesso
DROP POLICY IF EXISTS "Users manage own devices" ON public.devices;

CREATE POLICY "Users select own or granted devices"
ON public.devices FOR SELECT
USING (auth.uid() = user_id OR public.user_can_access_device(auth.uid(), id));

CREATE POLICY "Users insert own devices"
ON public.devices FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own devices"
ON public.devices FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own devices"
ON public.devices FOR DELETE
USING (auth.uid() = user_id);

-- 4) Conversations: SELECT/UPDATE estendido para client com acesso ao device
DROP POLICY IF EXISTS "Users can manage own conversations" ON public.conversations;

CREATE POLICY "Users select conversations"
ON public.conversations FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.agents WHERE agents.id = conversations.agent_id AND agents.user_id = auth.uid())
  OR (device_id IS NOT NULL AND public.user_can_access_device(auth.uid(), device_id))
);

CREATE POLICY "Users insert conversations"
ON public.conversations FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.agents WHERE agents.id = conversations.agent_id AND agents.user_id = auth.uid())
);

CREATE POLICY "Users update conversations"
ON public.conversations FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM public.agents WHERE agents.id = conversations.agent_id AND agents.user_id = auth.uid())
  OR (device_id IS NOT NULL AND public.user_can_access_device(auth.uid(), device_id))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.agents WHERE agents.id = conversations.agent_id AND agents.user_id = auth.uid())
  OR (device_id IS NOT NULL AND public.user_can_access_device(auth.uid(), device_id))
);

CREATE POLICY "Users delete conversations"
ON public.conversations FOR DELETE
USING (
  EXISTS (SELECT 1 FROM public.agents WHERE agents.id = conversations.agent_id AND agents.user_id = auth.uid())
);

-- 5) Messages: SELECT/INSERT estendido
DROP POLICY IF EXISTS "Users can manage own messages" ON public.messages;

CREATE POLICY "Users select messages"
ON public.messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.agents a ON a.id = c.agent_id
    WHERE c.id = messages.conversation_id AND a.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND c.device_id IS NOT NULL
      AND public.user_can_access_device(auth.uid(), c.device_id)
  )
);

CREATE POLICY "Users insert messages"
ON public.messages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.agents a ON a.id = c.agent_id
    WHERE c.id = messages.conversation_id AND a.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND c.device_id IS NOT NULL
      AND public.user_can_access_device(auth.uid(), c.device_id)
  )
);

CREATE POLICY "Users update messages"
ON public.messages FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.agents a ON a.id = c.agent_id
    WHERE c.id = messages.conversation_id AND a.user_id = auth.uid()
  )
);

CREATE POLICY "Users delete messages"
ON public.messages FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.agents a ON a.id = c.agent_id
    WHERE c.id = messages.conversation_id AND a.user_id = auth.uid()
  )
);

-- 6) Appointments: SELECT estendido
DROP POLICY IF EXISTS "Users manage own appointments" ON public.appointments;

CREATE POLICY "Users select appointments"
ON public.appointments FOR SELECT
USING (
  auth.uid() = user_id
  OR (device_id IS NOT NULL AND public.user_can_access_device(auth.uid(), device_id))
);

CREATE POLICY "Users insert appointments"
ON public.appointments FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update appointments"
ON public.appointments FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete appointments"
ON public.appointments FOR DELETE
USING (auth.uid() = user_id);
