CREATE TABLE public.blacklist (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  phone text NOT NULL,
  label text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, phone)
);

ALTER TABLE public.blacklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own blacklist" ON public.blacklist
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);