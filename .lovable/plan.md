

# Diagnóstico e Correção do Inbox Vazio

## Diagnóstico
O banco de dados tem **zero conversas** — o inbox está vazio porque nenhum dado chegou, não por problema de query ou RLS. A causa raiz: o webhook da Evolution API **não é configurado automaticamente** quando um dispositivo conecta, então as mensagens nunca chegam ao sistema.

As RLS policies de `conversations` e `messages` já estão corretas (JOIN com agents + auth.uid()).

---

## Correções (5 arquivos)

### 1. Auto-configurar webhook no `device-connect/index.ts`
Após detectar conexão bem-sucedida (status "open") ou após criar instância, chamar `POST /webhook/set/:instance` na Evolution API com a URL do webhook:
```
url: ${SUPABASE_URL}/functions/v1/evolution-webhook
events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'MESSAGES_UPDATE']
```
Aplicar em dois pontos: quando `state === "open"` (já conectado) e após criar/conectar instância.

### 2. Auto-configurar webhook no `device-status/index.ts`
Quando detectar `state === "open"`, também chamar `POST /webhook/set/:instance` para garantir que o webhook esteja sempre configurado.

### 3. Adicionar logs no `evolution-webhook/index.ts`
No início do handler, antes de qualquer lógica:
- `console.log('=== WEBHOOK RECEBIDO ===', event, instanceName)`
- Log do body completo para debug
- Log quando ignora mensagem própria (`fromMe`)

### 4. Botão "Criar conversa de teste" no `InboxPage.tsx`
Botão temporário que:
- Busca o primeiro agente do usuário
- Insere uma conversation + uma message de teste
- Se aparecer = webhook é o problema; se não = query/RLS

### 5. Botão "Verificar webhook" no `DevicesPage.tsx`
No modal de gerenciar dispositivo, botão que:
- Chama `GET /webhook/find/:instance` via uma edge function auxiliar ou diretamente (passando credenciais)
- Mostra a URL configurada atualmente
- Alerta se a URL estiver vazia ou incorreta

### 6. Nova Edge Function `check-webhook/index.ts`
Recebe `{ device_id }`, busca device, chama `GET /webhook/find/:instance`, retorna a URL configurada.

---

## Arquivos impactados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/device-connect/index.ts` | Auto-configurar webhook após conexão |
| `supabase/functions/device-status/index.ts` | Auto-configurar webhook quando connected |
| `supabase/functions/evolution-webhook/index.ts` | Logs detalhados |
| `supabase/functions/check-webhook/index.ts` | **Nova** — diagnóstico de webhook |
| `src/pages/InboxPage.tsx` | Botão "Criar conversa de teste" |
| `src/pages/DevicesPage.tsx` | Botão "Verificar webhook" no modal |

