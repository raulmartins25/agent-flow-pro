

# Correção da Lógica de Prospecção — Usando `is_waiting_reply` boolean

## 1. Migração SQL
Adicionar coluna `is_waiting_reply boolean default false` à tabela `conversations`. Sem alterar enum.

```sql
ALTER TABLE public.conversations ADD COLUMN is_waiting_reply boolean NOT NULL DEFAULT false;
```

## 2. WizardStep3.tsx
Ajustar placeholder para texto exato solicitado e label do preview para "Enviado por você via disparo". Já tem banner âmbar e diferenciação por tipo — apenas refinamentos textuais.

## 3. compilePrompt.ts
Substituir bloco de prospecção pelo texto exato com `REGRAS CRÍTICAS` (não `IMPORTANTE`), incluindo "NUNCA diga 'como mencionei antes'", removendo regra de encerramento em 2 mensagens.

## 4. blast-processor/index.ts
- Buscar `agent_persona_name` e `company_name` do `agent_config` para substituir `{{nome_agente}}` e `{{empresa}}`
- Criar conversa com `status: 'active'`, `is_waiting_reply: true`, remover `agent_paused: true`
- NÃO chamar process-message

## 5. evolution-webhook/index.ts
- Ao encontrar conversa, verificar `is_waiting_reply`
- Se `is_waiting_reply === true` e `!fromMe`:
  - Atualizar `is_waiting_reply: false`
  - Salvar mensagem do lead
  - Chamar process-message
  - Retornar
- Manter lógica existente de `agent_paused` para pausa manual

## 6. process-message/index.ts
Atualizar texto da instrução especial para primeira resposta: "natural e calorosa", "não comece com 'Que ótimo!' ou 'Perfeito!'".

## 7. NewBlastPage.tsx
Completar substituição de `{{nome_agente}}` e `{{empresa}}` com valores reais do agent_config.

## Arquivos

| Arquivo | Mudança |
|---|---|
| Nova migração SQL | `ALTER TABLE conversations ADD COLUMN is_waiting_reply` |
| `src/components/wizard/WizardStep3.tsx` | Placeholder e label refinados |
| `src/lib/compilePrompt.ts` | Bloco prospecção com texto exato |
| `supabase/functions/blast-processor/index.ts` | `is_waiting_reply: true`, variáveis completas |
| `supabase/functions/evolution-webhook/index.ts` | Detectar `is_waiting_reply` → false |
| `supabase/functions/process-message/index.ts` | Instrução especial atualizada |
| `src/pages/NewBlastPage.tsx` | Variáveis no preview com valores reais |

