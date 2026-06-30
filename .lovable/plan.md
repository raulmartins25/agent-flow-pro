## Diagnóstico

Aqueles "contatos" no topo do Inbox (ex.: `46918642180299`, `45196007972918`, `192882786959389`, `211608911515836`) **não são clientes**. São JIDs internos do WhatsApp — provavelmente `@lid` (Linked Identifier, ID interno do device pareado), `@broadcast` ou `status@broadcast` — que o `evolution-webhook` recebeu, passou pelo `canonicalPhone()` (que cortou o sufixo `@lid`) e gravou como se fosse telefone.

Evidências no banco:
- As 4 conversas têm `msg_count = 0` e `last_message_at = NULL`.
- `contact_name == contact_number` (nunca teve `pushName`).
- Padrão de 14-15 dígitos, incompatível com telefone BR (12-13 dígitos).
- Por isso o chat aparece **em branco** quando você clica — literalmente não há mensagens.
- Aparecem no topo porque o Inbox ordena por `last_message_at DESC` e o Postgres coloca `NULL` antes de qualquer data quando descendente — então essas conversas vazias ficam acima de todas as reais.

Atualmente o `evolution-webhook` só filtra `@g.us` (grupos) e `fromMe`. Nada barra `@lid`, `@broadcast`, `@newsletter` ou `status@broadcast`.

## Mudanças

### 1. `supabase/functions/evolution-webhook/index.ts` — filtrar JIDs não-usuário
Logo após o filtro de `@g.us`, adicionar guarda:
- Ignorar e retornar `{ok:true}` se `rawJid` terminar com `@lid`, `@broadcast`, `@newsletter`, ou for igual a `status@broadcast`.
- Como cinto-e-suspensório, depois do `canonicalPhone`, se o resultado não casar com `^\d{10,15}$` *e* não tiver `pushName` plausível, ignorar (loga e sai).

Não mexer em mais nada da lógica do webhook (mensagens, mídias, conversas reais continuam idênticas).

### 2. Limpeza das 4 conversas órfãs existentes
Migration única (DELETE escopado e seguro): apagar de `conversations` apenas as linhas onde `last_message_at IS NULL` **e** `msg_count = 0` **e** `contact_number ~ '^\d{14,}$'` (ou seja, 14+ dígitos puros). Hoje isso atinge exatamente: `45196007972918`, `46918642180299`, `67843320229922`, `211608911515836`, `192882786959389`. Mensagens não existem para elas, então não há cascata relevante.

### 3. `src/pages/InboxPage.tsx` — ordenação estável
No `fetchConvs`, trocar `.order('last_message_at', { ascending: false })` por `.order('last_message_at', { ascending: false, nullsFirst: false })`. Conversas sem mensagem caem para o fim da lista em vez de poluírem o topo. (Sem nenhuma outra mudança de UI/lógica.)

## Fora de escopo
- Não mexer em `process-message`, prompts da Jordana, Ecuro, find_nearest_unit, anti-ban, warmup, relatórios ou RLS.
- Não alterar `canonicalPhone` (vários pontos do código dependem dele).
- Não tocar no fluxo de mídia nem em conversas reais já existentes.

## Validação
1. Após deploy, conferir no Inbox que `maria Lima` (11:59) volta ao topo e nenhum ID de 14+ dígitos aparece.
2. Rodar `SELECT count(*) FROM conversations WHERE contact_number ~ '^\d{14,}$'` → deve voltar 0.
3. Acompanhar logs do `evolution-webhook` por algumas horas: deve aparecer linha "Non-user JID ignored: …@lid" quando o WhatsApp mandar esses eventos, e nenhuma conversa nova com nome numérico longo deve surgir.

## Por que o chat ficou em branco
Você clicou em `46918642180299` — essa conversa tem **0 mensagens** no banco (foi criada por um evento `@lid` espúrio, nunca recebeu texto). Não é bug de renderização; é só lixo. Com a limpeza + filtro acima, isso para de acontecer.
