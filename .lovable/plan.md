

# Variações de Mensagem de Prospecção

## Resumo
Adicionar suporte a múltiplas variações da mensagem de disparo (máx 5), com rotação aleatória no blast-processor, geração automática via IA, e indicador de similaridade.

## Migração SQL

```sql
ALTER TABLE agent_config ADD COLUMN IF NOT EXISTS prospecting_messages jsonb;
ALTER TABLE blast_contacts ADD COLUMN IF NOT EXISTS metadata jsonb;
```

## `src/stores/agentStore.ts`

- Adicionar campo `prospecting_messages: string[]` à interface (default `[]`)
- Manter `first_prospecting_message` para compatibilidade
- No `initialWizardData`, inicializar `prospecting_messages` com `['Olá {{nome_contato}}! ...']`

## `src/components/wizard/WizardStep3.tsx`

**Para tipo receptive**: sem mudança (textarea simples de welcome_message).

**Para tipo prospecting**: substituir textarea único por:

1. **Header**: "Variações da mensagem de disparo" + subtítulo explicativo + badge "Recomendado: mínimo 3 variações"

2. **Lista de variações**: Cada item com número, textarea e botão X (mín 1, máx 5). Botão "+ Adicionar variação" (some ao atingir 5)

3. **Botão "Gerar variações com IA"**: 
   - Sem mensagem → toast de erro
   - Com mensagem → chama edge function `simulate-chat` ou cria chamada à Lovable AI gateway via edge function para gerar variações
   - Usa Lovable AI (LOVABLE_API_KEY já existe) via nova edge function `generate-variations`
   - Loading state no botão

4. **Indicador de similaridade**: Badge verde "Boa variação" (>40% palavras diferentes) ou amarelo "Muito similar" (<40%) — cálculo simples no frontend

5. **Preview**: Mostra preview da variação em foco (ou variação 1 por default)

## Edge function `supabase/functions/generate-variations/index.ts`

- Recebe `{ message: string, count: number }`
- Chama Lovable AI gateway com prompt para gerar variações
- Retorna array de strings

## `supabase/functions/blast-processor/index.ts`

- Atualizar select para incluir `prospecting_messages` no join de `agent_config`
- Lógica de fallback:
  ```
  const messages = agentConfig.prospecting_messages?.length > 0
    ? agentConfig.prospecting_messages
    : agentConfig.first_prospecting_message
      ? [agentConfig.first_prospecting_message]
      : null
  ```
- Se null → marcar campanha como erro
- Selecionar variação aleatória: `messages[Math.floor(Math.random() * messages.length)]`
- Replace de variáveis com `.trim() || ''` fallback
- Salvar `metadata: { message_variation_index }` em try/catch separado

## `src/pages/AgentWizard.tsx`

- No `loadAgent`, converter `config.prospecting_messages` ou fallback de `first_prospecting_message` para array
- No `handleSave`, salvar `prospecting_messages` no `agent_config` (insert e update)
- Atualizar validação step 2: checar que pelo menos 1 variação tem texto
- Continuar salvando `first_prospecting_message` como `prospecting_messages[0]` para compatibilidade

## Arquivos impactados

| Arquivo | Mudança |
|---|---|
| Migração SQL | `prospecting_messages` jsonb + `metadata` jsonb |
| `src/stores/agentStore.ts` | Novo campo `prospecting_messages: string[]` |
| `src/components/wizard/WizardStep3.tsx` | UI de variações + IA + similaridade |
| `supabase/functions/generate-variations/index.ts` | Nova edge function para gerar variações via Lovable AI |
| `supabase/functions/blast-processor/index.ts` | Rotação aleatória + fallback + metadata |
| `src/pages/AgentWizard.tsx` | Load/save de prospecting_messages + validação |

