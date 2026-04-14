ALTER TABLE public.messages
ADD COLUMN evolution_message_id text;

CREATE UNIQUE INDEX idx_messages_evolution_id
ON public.messages (evolution_message_id)
WHERE evolution_message_id IS NOT NULL;