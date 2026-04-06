
# Corrigir exibição do @s.whatsapp.net no Inbox

## Causa raiz
O campo `contact_name` em muitas conversas contém o número completo com `@s.whatsapp.net` (ex: `5562999202681@s.whatsapp.net`). A UI exibe `contact_name` com prioridade sobre `contact_number`, mas só aplica o `displayPhone` no fallback para `contact_number`. Então quando `contact_name` existe com o sufixo, ele aparece sujo.

## Correção
**Arquivo:** `src/pages/InboxPage.tsx`

Aplicar `displayPhone()` também em `contact_name` nos pontos de exibição. Em todos os lugares onde aparece `c.contact_name || displayPhone(c.contact_number)`, mudar para `displayPhone(c.contact_name || c.contact_number)`. Isso cobre:

1. **Avatar inicial** (linha ~261)
2. **Nome na lista** (linha ~266)
3. **Nome no header do chat** (linha ~295)

Assim, se `contact_name` for um número com `@s.whatsapp.net`, ele é limpo. Se for um nome real (sem `@`), o regex não altera nada.

| Arquivo | Mudança |
|---|---|
| `src/pages/InboxPage.tsx` | Aplicar `displayPhone` ao `contact_name` em 3 pontos |
