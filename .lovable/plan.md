

# Correção da Transferência — Nome do Contato + Logs

## Problemas identificados

1. **Resumo sem nome do contato** — O summary não inclui `contact_name`. O `process-message` não recebe nem busca esse dado da conversa.
2. **pushName não atualizado em conversas existentes** — O webhook só salva `pushName` ao criar conversa nova (linha 129). Conversas existentes nunca recebem atualização do nome.
3. **Prompt não menciona o nome do contato** — A IA não sabe o nome do lead para personalizar.

**Nota**: O `number` no envio do resumo (linha 173) já usa `agentFull.transfer_number` corretamente. Não há bug aí.

---

## Correções

### 1. `supabase/functions/evolution-webhook/index.ts`
- Ao reutilizar conversa existente (bloco linha 107-119), atualizar `contact_name` com `pushName` se disponível e se o nome atual for genérico (igual ao número ou vazio)
- Passar `contact_name` no payload enviado ao `process-message` (nos dois pontos onde chama: linha 187 e ~230)

### 2. `supabase/functions/process-message/index.ts`
- Receber `contact_name` do payload (já vem do webhook)
- Se não vier, buscar da conversa no banco
- Incluir `contact_name` no resumo de transferência: `*Nome:* ${contactName}`
- Adicionar logs de debug no bloco de transferência

### 3. `src/lib/compilePrompt.ts`
- Não é possível incluir `contact_name` no prompt compilado em tempo de criação do agente — o nome varia por conversa
- Em vez disso, adicionar no `process-message` uma instrução dinâmica ao system prompt antes de enviar à LLM:
  `"O nome do contato é: {contact_name}. Use para personalizar, não pergunte o nome."`

---

## Arquivos impactados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/evolution-webhook/index.ts` | Atualizar contact_name com pushName + passar no payload |
| `supabase/functions/process-message/index.ts` | Receber contact_name, incluir no resumo e no prompt dinâmico |

**Nota**: `compilePrompt.ts` não precisa mudar — o nome do contato é dinâmico por conversa, então a instrução vai direto no system prompt em runtime dentro do `process-message`.

