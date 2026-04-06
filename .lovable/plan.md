

# Remover "@s.whatsapp.net" apenas na exibição do Inbox

## Importante
A mudança é **apenas visual** — nenhum dado no banco será alterado. O `contact_number` original permanece intacto para todas as funções (envio de mensagem, webhook, blast, etc.).

## Mudança

### `src/pages/InboxPage.tsx`

Adicionar helper de exibição no topo do componente:
```typescript
const displayPhone = (raw: string) => raw?.replace(/@s\.whatsapp\.net$/i, '') || '';
```

Aplicar `displayPhone()` nos pontos de **renderização** apenas:
- Lista de conversas: texto do nome/número e inicial do avatar
- Header do chat: nome e número do contato

Nenhuma query, insert, update ou lógica de negócio será alterada.

| Arquivo | Mudança |
|---|---|
| `src/pages/InboxPage.tsx` | Helper `displayPhone` + aplicar em ~5 pontos de exibição |

