# Jordana — 3 correções: endereço único, anti-invenção de horário, log de cancelamento

## Problemas confirmados (investigação no banco + código)

1. **Endereços diferentes pra mesma clínica** — A integração Ecuro da Jordana NÃO tem `address` nem `maps_url` cadastrados. O `process-message` só injeta o bloco "LOCAL DA CLÍNICA" se esses campos existirem. Sem fonte oficial, a IA improvisa ("Parque Anhanguera, Goiânia", "depois te envio o endereço", "fica em Goiânia mesmo, não em Aparecida"…) — daí versões conflitantes pra leads como Leuzilene.

2. **Horários errados (caso Eli)** — Vi mensagens da IA citando horário ("segunda 11/05 às 08:00") em conversa, enquanto o lembrete oficial era 14:15. As travas server-side de `ecuro-schedule` (`outside_business_hours`, `slot_not_offered`) já impedem **criar** agendamento errado, mas não impedem a IA de **falar** horário em texto livre. Falta uma regra dura: nunca citar horário sem ter acabado de chamar `get_availability` no mesmo turno; nunca repetir de memória horário ditado em turnos passados.

3. **"Falha ao cancelar [Ecuro]" no painel** — Texto gerado pelo `ecuro-cancel/index.ts` ao gravar log com `role='system'` em `messages`. Você confirmou que NÃO chega no paciente (fica só no painel), mas polui histórico e a IA lê isso. Vou (a) tornar o log mais discreto e técnico (sem "Falha"), (b) marcar como interno pra não ser confundido com mensagem do paciente, (c) reforçar no prompt que mensagens `[Ecuro]` são logs internos — nunca comentar/repetir pro lead.

---

## O que muda

### 1. Endereço oficial — single source of truth
Update na linha de `agent_integrations` (Jordana, provider `ecuro`) adicionando:
- `address`: `Av. Pasteur, n° 122 - Parque Anhanguera II, Goiânia - GO, 74340-570`
- `maps_url`: `https://maps.app.goo.gl/HxSAatEcKFZbV2E48`

Sem mudança de schema, sem mudança em outras integrações. O `process-message` já lê esses campos e injeta como "LOCAL DA CLÍNICA" no system prompt, com regra "use SEMPRE estes dados exatos" e "NUNCA invente, encurte ou modifique este link".

### 2. Reforçar `ai_restrictions` da Jordana — anti-invenção de endereço e horário
Adicionar ao bloco `ai_restrictions`, **sem remover regras existentes** (preço, qualificação, anti-loop continuam intactos):

- **ENDEREÇO E LOCALIZAÇÃO** — Só usar exatamente o endereço/link que vem no bloco "LOCAL DA CLÍNICA". Proibido inventar bairro, número, cidade, "perto de X", "facilita acesso", encurtar link, parafrasear endereço. Se o lead pedir localização e por algum motivo o bloco não estiver disponível, responder "vou te confirmar a localização exata em instantes" e emitir `TRANSFER_LEAD` — nunca chutar.
- **HORÁRIOS** — Proibido citar qualquer data ou horário específico (ex.: "08:00", "segunda 11/05", "amanhã às 14h") sem ter chamado `get_availability` no MESMO turno e usado os slots literais retornados. Confirmações de agendamento só podem citar a data/hora que VOCÊ acabou de passar para `schedule_appointment` e que o servidor confirmou com sucesso. Proibido repetir de memória horário ditado em turnos anteriores; se precisar reconfirmar, chamar `get_availability` de novo silenciosamente. Lembretes/mensagens proativas sobre "sua consulta é dia X às Y" são responsabilidade do sistema (`appointment-reminders-cron`) — a IA NUNCA improvisa esses lembretes.
- **LOGS INTERNOS `[Ecuro]`** — Mensagens no histórico que começam com `[Ecuro]` são logs do sistema, não falas do paciente nem suas. Nunca repetir, comentar, citar status técnico, código de erro ou nome de função pro lead. Se um agendamento/cancelamento falhar, pedir desculpas em linguagem natural ("tive um probleminha aqui, vou pedir pra equipe te ajudar") e emitir `TRANSFER_LEAD`.

### 3. Limpar mensagem de log do `ecuro-cancel`
No `supabase/functions/ecuro-cancel/index.ts`, trocar o texto "Falha ao cancelar (${res.status}): …" por algo neutro tipo `[Ecuro][LOG INTERNO] cancel retornou status ${res.status}` e o sucesso por `[Ecuro][LOG INTERNO] cancel OK (${appt.external_id})`. Continua gravado como `role='system'` (já é filtrado/visualmente separado do paciente). Sem mudança de contrato HTTP, sem mudança de UI.

## Garantias de não-regressão
- Mudança escopada por `agent_id` no prompt e por linha única em `agent_integrations`. Outros agentes intactos.
- Regras de preço, qualificação, anti-loop, transferência, anti-ban, follow-up, Ecuro flow permanecem **idênticas**.
- Travas server-side de horário (`outside_business_hours`, `slot_not_offered`) continuam ativas — a nova regra de prompt é uma camada extra, não substitui.
- `ecuro-cancel` mantém comportamento funcional; só o texto do log muda.
- Validação após aplicar: simulate-chat em 3 cenários — "qual o endereço?", "que horas você marcou pra mim?" (sem ter agendado), "quero cancelar" (forçando erro Ecuro) — confirmando que (a) endereço sai literal, (b) IA não chuta horário, (c) IA não vaza texto de erro técnico.

## Fora de escopo
- Não mexo em outros agentes.
- Não altero schema do banco nem outras edge functions.
- Não toco em preço, qualificação ou transferência (já ajustados em ciclos anteriores).
