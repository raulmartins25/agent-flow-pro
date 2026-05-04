# Lembretes de Agendamento Ecuro

Quando um agendamento for criado pelo agente, o sistema armazena e envia lembretes automáticos via WhatsApp:
- **24h antes** da consulta
- **2h antes** da consulta

Se o lead **confirmar** em qualquer um, o seguinte é cancelado.
**Disparos só ocorrem em horário comercial (seg–sex, 08h–18h, fuso America/Sao_Paulo).** Fora disso, o lembrete é adiado para a próxima janela comercial — exceto o lembrete de 2h, que se cair fora da janela é simplesmente pulado (já é tarde demais para ser útil).

---

## 1. Nova tabela `appointments`

- `id`, `user_id`, `agent_id`, `conversation_id`, `device_id`
- `contact_number`, `contact_name`
- `start_time` (timestamptz), `end_time`, `clinic_name`, `specialty_name`
- `external_id` (id retornado pelo Ecuro)
- `status`: `scheduled | confirmed | cancelled | completed`
- `reminder_24h_sent_at`, `reminder_24h_status` (`pending | sent | confirmed | skipped`)
- `reminder_2h_sent_at`, `reminder_2h_status`
- `confirmed_at`, `confirmed_via` (`24h | 2h | manual`)
- `created_at`, `updated_at`

RLS: `user_id = auth.uid()`.

## 2. Persistir agendamento no `ecuro-schedule`

Após sucesso da chamada Ecuro, inserir linha em `appointments` com paciente, conversa, device, horário, clínica e especialidade.

## 3. Edge function `appointment-reminders-cron`

Roda a cada 5 minutos via `pg_cron` + `pg_net`. Lógica:

1. **Checar horário comercial** (America/Sao_Paulo): se `dia_semana ∈ [seg..sex]` e `hora ∈ [08:00, 18:00)`. Se NÃO estiver:
   - **Lembrete 24h pendente**: não envia agora, aguarda próxima execução dentro da janela comercial (mesmo que isso atrase para depois das 24h exatas — desde que ainda falte mais de 2h para a consulta).
   - **Lembrete 2h pendente**: marca como `skipped` (não faz sentido lembrar fora do horário comercial quando faltam só 2h).

2. Buscar `appointments` com `status='scheduled'` e `start_time > now()`:
   - Se `start_time - now() ≤ 24h` e `reminder_24h_status='pending'` → enviar lembrete 24h (respeitando a regra acima).
   - Se `start_time - now() ≤ 2h` e `reminder_2h_status='pending'` e não confirmado → enviar lembrete 2h.

3. Marcar `reminder_*_sent_at` e status `sent` (ou `skipped`).

4. Mensagens:
   - 24h: "Oi {nome}! Passando para lembrar do seu atendimento amanhã às {hora} na {clinica}. Está confirmado? 😊"
   - 2h: "Oi {nome}! Sua consulta é hoje às {hora}. Posso confirmar sua presença?"

5. Inserir em `messages` (role=assistant) e enviar via Evolution API usando o `device` da conversa.

## 4. Detecção de confirmação no `process-message`

Antes da LLM, se a conversa tiver appointment com lembrete enviado e ainda não confirmado:
- Normalizar texto do usuário (lowercase, sem acento).
- Palavras de confirmação (`sim`, `confirmo`, `confirmado`, `ok`, `estarei`, `vou sim`, `pode confirmar`, `tá`, `combinado`) → `status='confirmed'`, `confirmed_via='24h'|'2h'`, `confirmed_at=now()`, e marcar próximo lembrete como `skipped`.
- Adicionar contexto no prompt: "O paciente confirmou presença. Agradeça brevemente e encerre."
- Cancelamento ("não posso", "remarcar", "cancelar") → `status='cancelled'` + `TRANSFER_LEAD`.

## 5. Cron schedule

```sql
select cron.schedule(
  'appointment-reminders-every-5-min',
  '*/5 * * * *',
  $$ select net.http_post(
    url := 'https://bcokzxaqwzsgszoltzuo.supabase.co/functions/v1/appointment-reminders-cron',
    headers := '{"Content-Type":"application/json","apikey":"<anon>"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);
```

## 6. UI mínima (opcional — confirmar se quer agora)

Página `/appointments` listando próximos agendamentos com status dos lembretes (enviado / confirmado / pulado).

---

## Detalhes técnicos

**Horário comercial**: constante no edge function (seg–sex, 08–18, `America/Sao_Paulo`). Calculado via `Intl.DateTimeFormat` com `timeZone`. Fácil tornar configurável por agente depois.

**Arquivos novos**
- `supabase/migrations/<ts>_appointments.sql` — tabela + enums + RLS.
- `supabase/functions/appointment-reminders-cron/index.ts`
- Cron via insert tool.

**Arquivos editados**
- `supabase/functions/ecuro-schedule/index.ts` — INSERT em `appointments`.
- `supabase/functions/process-message/index.ts` — detecção de confirmação/cancelamento.

**Idempotência**: status vira `sent`/`skipped` imediatamente; cron ignora marcados.
