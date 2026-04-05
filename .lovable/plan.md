

# Correção: IA para de responder após envio de mídia

## Diagnóstico

Os logs mostram o erro exato:

```
DeepSeek API error 400: "Invalid assistant message: content or tool_calls must be set"
```

**Causa raiz**: Quando a IA envia mídia (`SEND_MEDIA:xxx`), o código salva a mensagem de mídia no banco com `content: media.offer_message || null`. Na próxima interação, o webhook busca o histórico (`select role, content`) e envia mensagens com `content: null` para a DeepSeek. A DeepSeek rejeita mensagens de assistant com content vazio/null.

## Solução

### 1. `supabase/functions/process-message/index.ts` — Filtrar histórico

Na construção do array `messages` (linha 99-102), filtrar mensagens com content vazio/null:

```typescript
const messages = [
  { role: "system", content: systemPrompt },
  ...history
    .filter((m: any) => m.content && m.content.trim() !== "")
    .map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
];
```

### 2. `supabase/functions/evolution-webhook/index.ts` — Buscar content não-nulo

Na query de histórico (linhas 184-189 e similar no bloco principal), adicionar filtro:

```typescript
.select("role, content")
.eq("conversation_id", conversation.id)
.not("content", "is", null)
.order("created_at", { ascending: true })
.limit(50);
```

Isso garante que mensagens de mídia sem texto não entrem no histórico enviado à IA.

## Arquivos impactados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/process-message/index.ts` | Filtrar mensagens com content null/vazio antes de enviar à IA |
| `supabase/functions/evolution-webhook/index.ts` | Excluir mensagens sem content da query de histórico |

