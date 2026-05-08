CREATE POLICY "Clients can view agents of granted devices"
ON public.agents
FOR SELECT
USING (
  device_id IS NOT NULL AND public.user_can_access_device(auth.uid(), device_id)
);