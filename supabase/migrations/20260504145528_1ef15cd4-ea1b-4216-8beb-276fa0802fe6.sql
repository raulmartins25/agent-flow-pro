
CREATE TYPE public.appointment_status AS ENUM ('scheduled','confirmed','cancelled','completed');
CREATE TYPE public.reminder_status AS ENUM ('pending','sent','confirmed','skipped');

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  conversation_id uuid,
  device_id uuid,
  contact_number text NOT NULL,
  contact_name text,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  clinic_name text,
  specialty_name text,
  external_id text,
  status public.appointment_status NOT NULL DEFAULT 'scheduled',
  reminder_24h_status public.reminder_status NOT NULL DEFAULT 'pending',
  reminder_24h_sent_at timestamptz,
  reminder_2h_status public.reminder_status NOT NULL DEFAULT 'pending',
  reminder_2h_sent_at timestamptz,
  confirmed_at timestamptz,
  confirmed_via text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointments_start_time ON public.appointments(start_time) WHERE status = 'scheduled';
CREATE INDEX idx_appointments_conversation ON public.appointments(conversation_id);
CREATE INDEX idx_appointments_user ON public.appointments(user_id);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own appointments"
ON public.appointments FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_appointments_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
