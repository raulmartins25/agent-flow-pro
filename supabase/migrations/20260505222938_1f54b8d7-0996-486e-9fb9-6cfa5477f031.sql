-- Remove possible duplicates first
DELETE FROM public.conversations a USING public.conversations b
WHERE a.ctid < b.ctid
  AND a.agent_id = b.agent_id
  AND a.device_id = b.device_id
  AND a.contact_number = b.contact_number;

ALTER TABLE public.conversations
ADD CONSTRAINT conversations_agent_device_contact_unique
UNIQUE (agent_id, device_id, contact_number);