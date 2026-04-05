

# Corrigir Transferência Não Entregue

## Diagnóstico
Os logs mostram que o código de transferência **executou sem erro** ("Lead transferido para: +5562997274903"), mas a mensagem não chegou no WhatsApp. Duas causas:

1. **Formato do número** — O `transfer_number` está salvo como `+5562997274903` (com `+`). A Evolution API espera números sem `+`. Todas as outras chamadas da Evolution (envio ao lead) usam números normalizados sem `+`, mas o `transfer_number` vem direto do campo configurado pelo usuário.

2. **Resposta da Evolution API ignorada** — O `fetch` não verifica o `response.status` nem loga o body de retorno. Se a API retornar erro (ex: número inválido), o sistema simplesmente ignora.

## Correções

### 1. `supabase/functions/process-message/index.ts`
- Normalizar `transfer_number` removendo `+` antes de enviar: `agentFull.transfer_number.replace(/\+/g, '')`
- Logar a resposta da Evolution API (status + body) para diagnóstico
- Aplicar a mesma normalização em qualquer outro ponto que use `transfer_number`

```typescript
// Antes do fetch:
const transferNum = agentFull.transfer_number.replace(/\+/g, '');
console.log(`Sending to normalized transfer number: ${transferNum}`);

const transferRes = await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: evoKey || "" },
  body: JSON.stringify({ number: transferNum, text: summary }),
});
const transferResText = await transferRes.text();
console.log(`Evolution transfer response: status=${transferRes.status}, body=${transferResText.substring(0, 300)}`);
```

### 2. Nenhuma mudança no frontend
O campo `transfer_number` no wizard aceita qualquer formato — a normalização acontece no backend.

## Arquivos impactados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/process-message/index.ts` | Normalizar número + logar resposta da Evolution API |

