

# Diagnóstico: Agente não responde + Inbox vazio

## Problemas encontrados (3 causas raiz)

### 1. Formato de número incompatível entre Blast e Webhook
O blast-processor salva `contact_number` como `5562995085665@s.whatsapp.net`. O webhook normaliza para `556295085665` (sem sufixo). Como os formatos não batem, o webhook **cria uma conversa NOVA** em vez de encontrar a do blast. A conversa original com `is_waiting_reply: true` nunca é atualizada.

**Evidência no banco:**
- Conversa do blast: `5562995085665@s.whatsapp.net` (is_waiting_reply: true) — nunca tocada
- Conversa do webhook: `556295085665` (is_waiting_reply: false) — criada do zero

### 2. process-message retorna 500 (Empty AI response)
O agente usa `deepseek` com modelo `deepseek-v3`. A chamada à API DeepSeek falha silenciosamente (retorna resposta vazia), e o código apenas retorna "Empty AI response" sem logar o erro. Resultado: a IA nunca responde.

### 3. Inbox funciona, mas as conversas existem duplicadas
A query e RLS estão corretas. As 2 conversas existem no banco. O inbox deve estar mostrando-as (ou o problema é que o `agents!inner` filtra por `user_id` mas o select não inclui esse filtro explícito — o RLS já cuida disso).

---

## Correções

### A. `blast-processor/index.ts` — Normalizar contact_number
- Ao criar a conversa, **remover o sufixo** `@s.whatsapp.net` e `@g.us` do `contact.phone` antes de salvar em `contact_number`
- Isso garante que o formato bate com o que o webhook usa

### B. `evolution-webhook/index.ts` — Busca flexível
- Ao buscar conversa existente, também tentar match com `contact_number + '@s.whatsapp.net'` como fallback
- Ou normalizar ambos os lados para o mesmo formato (só dígitos)

### C. `process-message/index.ts` — Logging e fallback do DeepSeek
- Adicionar log do response body quando a API DeepSeek retorna resposta vazia
- Verificar se `res.ok` antes de fazer parse do JSON
- Logar claramente: provider, model, status code, response body (truncado)

### D. Limpar dados duplicados
- A conversa órfã do blast (`c11c94ae`, com `@s.whatsapp.net`) ficará sem uso. Não precisa de migração — basta que novos disparos usem o formato correto.

---

## Arquivos impactados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/blast-processor/index.ts` | Strip `@s.whatsapp.net` do contact_number |
| `supabase/functions/evolution-webhook/index.ts` | Busca flexível por contact_number |
| `supabase/functions/process-message/index.ts` | Logging de erro na chamada DeepSeek |

Sem migração SQL. Sem mudanças no frontend.

