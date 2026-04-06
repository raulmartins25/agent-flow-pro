

# Encerrar conversa quando lead demonstra desinteresse

## Diagnóstico

O prompt anti-ban só detecta palavras agressivas ("para", "stop", "me tira", "spam"). Quando o lead diz educadamente "Não tenho interesse, obrigada", a IA responde mas **não emite END_CONVERSATION**. A conversa fica com status `active` e o `followup-cron` envia follow-up normalmente — importunando o lead.

## Correção

### 1. `src/lib/compilePrompt.ts` — Ampliar regra anti-ban

Expandir a seção PROTEÇÃO ANTI-BAN para incluir sinais de desinteresse educado:

```
PROTEÇÃO ANTI-BAN:
Se o lead demonstrar irritação OU desinteresse, incluindo frases como:
- "para", "stop", "me tira", "não quero", "me bloqueia", "spam"
- "não tenho interesse", "sem interesse", "não preciso", "não quero receber", 
  "não me interessa", "obrigado mas não", "obrigada mas não"

1. Responda educadamente encerrando (ex: "Entendido! Caso mude de ideia, estaremos à disposição!")
2. Encerre o atendimento imediatamente.
3. Emita o token: END_CONVERSATION
4. NUNCA tente reconverter ou enviar follow-up.
```

### 2. `supabase/functions/followup-cron/index.ts` — Segurança extra

Adicionar filtro para não enviar follow-up em conversas com status `closed`:

Já filtra por `status: active`, mas adicionar checagem se a última mensagem do **lead** (role=user) contém sinais de desinteresse como camada de segurança extra:

```typescript
// Após pegar lastMsg, verificar se o lead mostrou desinteresse
const { data: lastUserMsg } = await supabase
  .from("messages")
  .select("content")
  .eq("conversation_id", conv.id)
  .eq("role", "user")
  .order("created_at", { ascending: false })
  .limit(1);

const userText = (lastUserMsg?.[0]?.content || "").toLowerCase();
const disinterestWords = ["não tenho interesse", "sem interesse", "não preciso", 
  "não quero", "não me interessa", "para", "stop", "spam"];
if (disinterestWords.some(w => userText.includes(w))) {
  // Fechar conversa e pular follow-up
  await supabase.from("conversations").update({ status: "closed" }).eq("id", conv.id);
  continue;
}
```

## Arquivos impactados

| Arquivo | Mudança |
|---|---|
| `src/lib/compilePrompt.ts` | Ampliar regra anti-ban para incluir desinteresse educado |
| `supabase/functions/followup-cron/index.ts` | Checagem de segurança contra follow-up em leads desinteressados |

## Nota importante
Agentes existentes precisarão **recompilar o prompt** (salvar novamente no wizard) para a nova instrução entrar em efeito.

