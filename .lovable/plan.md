

## Problema

Os telefones nos `blast_contacts` estão salvos no formato JID (`5562995085665@s.whatsapp.net`), mas a Evolution API espera apenas os dígitos (`5562995085665`). O erro `{"exists": false}` acontece porque a API não reconhece o sufixo `@s.whatsapp.net`.

## Solução

**1. Corrigir o `blast-processor/index.ts`** — Remover o sufixo `@s.whatsapp.net` do número antes de enviar para a Evolution API:

```typescript
// Linha 235: trocar contact.phone por número limpo
number: contact.phone.replace(/@.*$/, ""),
```

**2. (Opcional) Corrigir na origem — `NewBlastPage.tsx`** — Salvar os números já sem o sufixo `@s.whatsapp.net` no banco ao criar a campanha, para evitar que o problema se repita em futuras campanhas.

A correção principal é no blast-processor (ponto de envio), garantindo que qualquer formato de telefone armazenado funcione.

