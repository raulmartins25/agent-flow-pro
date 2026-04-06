

# Corrigir nome no resumo + instrução de nome no prompt

## Mudanças em `supabase/functions/process-message/index.ts`

### Bug 1 — Nome no resumo vem como JID

**Problema**: Linha 226 faz `const contactName = contact_name || "Contato"` — se `contact_name` vier como `5562...@s.whatsapp.net`, o resumo de transferência mostra isso como nome.

**Correção**: Substituir linhas 224-229 para limpar o nome:

```typescript
let systemPrompt = agent.prompt_compiled;

// Fetch contact_name from conversation record too
const { data: convData } = await supabase
  .from("conversations")
  .select("contact_name")
  .eq("id", conversation_id)
  .single();

const rawContactName = convData?.contact_name || contact_name || null;
const cleanContactName = rawContactName && 
  !rawContactName.includes('@') && 
  !/^\d{8,}$/.test(rawContactName.trim())
    ? rawContactName.trim()
    : null;

const nameInstruction = cleanContactName
  ? `\n\nINFORMAÇÃO DO CONTATO:\nO nome do contato é "${cleanContactName}" (obtido automaticamente do WhatsApp). Use-o para personalizar, mas NÃO peça o nome — você já o tem.`
  : `\n\nINFORMAÇÃO DO CONTATO:\nO nome do contato não está disponível. NÃO faça perguntas para descobrir o nome — não é necessário para a qualificação.`;

systemPrompt += nameInstruction;
```

Isso resolve o Bug 2 também — a instrução agora diz explicitamente para NÃO perguntar o nome em nenhum caso.

### Bug 1 (parte 2) — Resumo de transferência

Na montagem do summary (linhas 354-375), substituir `contactName` por `cleanContactName || 'Não informado'`:

- Linha 355: `.replace(/\{\{nome_contato\}\}/g, cleanContactName || 'Não informado')`
- Linha 371: `summary += \`*Nome:* ${cleanContactName || 'Não informado'}\n\``

### Variável `contactName` usada no restante

A variável `contactName` (linha 226) é usada em dois blocos: o system prompt e o summary. Ambos serão atualizados. Vou remover a variável antiga e usar `cleanContactName` nos dois lugares.

## Arquivo impactado

| Arquivo | Mudança |
|---|---|
| `supabase/functions/process-message/index.ts` | Limpar nome do contato (remover JID/números puros) + instrução dinâmica no prompt |

