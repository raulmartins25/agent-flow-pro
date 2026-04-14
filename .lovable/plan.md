

## Auditoria: Agente Eva — problemas encontrados

### Status atual da Eva no banco
- `followup_max: 0` ✅ (toggle desativado corretamente)
- `status: inactive` ✅ (não vai responder mensagens)
- `type: prospecting`

### BUG CRÍTICO: followup_max = 0 não funciona

**Linha 75 do `followup-cron/index.ts`:**
```typescript
const followupMax = agent.followup_max || 3;
```

JavaScript trata `0` como **falsy**. Quando `followup_max` é `0`, o `||` faz fallback para `3`. A Eva (e qualquer agente com followup desativado) **vai receber 3 followups mesmo assim**.

**Correção:** Trocar `||` por `??` (nullish coalescing) nas 3 linhas:
```typescript
const followupMax = agent.followup_max ?? 3;
const followupInterval = agent.followup_interval_minutes ?? 120;
const followupStart = agent.followup_start_message ?? 3;
```

### Blacklist — OK em todas as camadas

| Camada | Status | Detalhes |
|--------|--------|----------|
| `evolution-webhook` | ✅ | Checa blacklist com `canonicalPhone`, fecha conversa se blacklisted |
| `process-message` | ✅ | Guardrail de blacklist antes de chamar LLM |
| `followup-cron` | ✅ | Checa blacklist, fecha conversa se blacklisted |
| `blast-processor` | ✅ | Checa blacklist antes de enviar disparo |

### Guardrails de status — OK

| Camada | Status | Detalhes |
|--------|--------|----------|
| `evolution-webhook` | ✅ | Early return para `transferred`, `closed`, `paused` — salva mensagem com `evolution_message_id` (idempotente) |
| `process-message` | ✅ | Guardrail para `transferred`, `closed`, `paused` antes do LLM |

### Detecção de desinteresse — OK
- `process-message`: checa frases de desinteresse antes do LLM, fecha conversa
- `followup-cron`: checa desinteresse antes de enviar followup, fecha conversa

### Resumo de ações

Apenas **1 correção** necessária:

**Arquivo:** `supabase/functions/followup-cron/index.ts` (linha 75-77)

Trocar `||` por `??` nas 3 atribuições de followup para que `0` seja respeitado como valor válido em vez de cair no fallback.

Sem essa correção, o toggle de desativar followup **não funciona** — é o único bug real. Todo o resto (blacklist, guardrails de status, idempotência) está correto.

