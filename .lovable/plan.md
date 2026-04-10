

## Plano Final — Blindagem completa (pronto para execução)

### 1. Migration SQL — coluna + índices

```sql
ALTER TABLE messages ADD COLUMN IF NOT EXISTS evolution_message_id text;
CREATE UNIQUE INDEX IF NOT EXISTS messages_evolution_id_unique 
  ON messages (evolution_message_id) WHERE evolution_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_agent_device_contact_active
  ON conversations (agent_id, device_id, contact_number)
  WHERE status IN ('active', 'paused', 'transferred');
```

### 2. `evolution-webhook/index.ts` — Reescrita completa

Fluxo na ordem exata:

1. **Filtro grupo** — `rawJid.endsWith("@g.us")` → descarta
2. **Filtro fromMe** — `msg.key?.fromMe === true` → descarta (previne loop)
3. **`normalizeContactNumber()`** — `jid.replace(/@.*$/, "").replace(/\D/g, "")` aplicado em todos os lookups e inserts
4. **Device/agent lookup** — sem mudança
5. **Blacklist** — comparação normalizada nos dois lados
6. **Conversation lookup** — busca por `agent_id + device_id + contact_number` normalizado, incluindo `transferred` e `closed`
7. **Early return para `transferred`/`closed`/`paused`** — salva mensagem **com `evolution_message_id`**, trata erro `23505` como duplicata, loga `msg.key?.id`, retorna sem chamar IA
8. **Prospecting (is_waiting_reply)** — insere mensagem com `evolution_message_id` + trata `23505`
9. **Upsert atômico** para criar conversa — `ignoreDuplicates: true`, `onConflict: "agent_id,device_id,contact_number"`
10. **Insert de mensagem normal** com `evolution_message_id` + trata `23505`
11. **Fluxo normal** → `process-message`

Correção crítica do usuário aplicada: **todos os inserts de mensagem** (inclusive dentro do early return) usam `evolution_message_id` e tratam `23505`.

### 3. `process-message/index.ts` — Guardrail hard

Substituir linhas 156-221 (free-response mode de ~65 linhas) por:

```typescript
if (["transferred", "closed", "paused"].includes(convCheck?.status)) {
  console.log(`Conversation ${conversation_id} status=${convCheck.status} — AI completely stopped`);
  return new Response(JSON.stringify({ ok: true, skipped: true, reason: convCheck.status }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

### 4. Deploy

Ordem: Migration → evolution-webhook → process-message

### Decisões confirmadas

- **`paused`** = IA silenciosa (incluído nos early returns e no guardrail)
- **`closed`** = incluído no guardrail do process-message (correção do usuário)
- **Idempotência** = via índice único + tratamento de `23505` (sem SELECT prévio)
- **Upsert** = `ignoreDuplicates: true` (não sobrescreve status existente)
- **Sem reativação automática** — conversas travadas ficam travadas

