
ALTER TABLE public.blacklist ADD COLUMN device_id uuid REFERENCES public.devices(id) ON DELETE CASCADE;

ALTER TABLE public.blacklist DROP CONSTRAINT IF EXISTS blacklist_user_id_phone_key;

ALTER TABLE public.blacklist ADD CONSTRAINT blacklist_user_id_device_id_phone_key UNIQUE(user_id, device_id, phone);
