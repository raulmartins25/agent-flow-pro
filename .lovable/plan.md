
Objetivo: fazer as conversas entrarem no sistema e aparecerem no Inbox sem mexer em partes não relacionadas.

Diagnóstico
- O problema principal não é mais o webhook configurado: ele já está correto.
- O webhook está recebendo eventos, mas `body.instance` vem como string (`"admin_starter_gvcm"`). O código atual lê `instance?.instanceName`, então `instanceName` fica vazio e o device nunca é encontrado.
- Além disso, o projeto está sem dados operacionais no fluxo do inbox: hoje há 1 device e 0 agents / 0 conversations / 0 messages. Mesmo após corrigir o parser do webhook, sem agente ativo vinculado ao device nada será criado.
- A query do Inbox também está simplificada demais e o realtime atual injeta registros sem hidratar os joins.

Plano de correção

1. Corrigir o parser do webhook
- Arquivo: `supabase/functions/evolution-webhook/index.ts`
- Ler `instance` nos dois formatos:
  - string
  - objeto com `instanceName`
- Normalizar `instanceName` e `remoteJid`.
- Logar claramente: evento, instanceName resolvido, device encontrado, agent encontrado.
- Ignorar `fromMe === true` antes de processar.
- Manter o isolamento por `device_id + agent_id + contact_number`.

2. Garantir agente operacional
- Arquivo: `src/pages/AgentWizard.tsx`
- Ajustar a criação para que o agente já nasça `active` quando houver dispositivo válido e nenhum outro agente ativo nele.
- Continuar bloqueando mais de 1 agente ativo por dispositivo.

3. Dar controle visual do status do agente
- Arquivo: `src/pages/Agents.tsx`
- Adicionar ação simples de ativar/desativar agente.
- Isso evita o cenário em que o device está conectado, mas o agente fica “invisivelmente inativo”.

4. Fortalecer a query do Inbox
- Arquivo: `src/pages/InboxPage.tsx`
- Trocar a busca por query com join em `agents!inner` e `devices`, filtrando por `agents.user_id = user.id`.
- Executar a carga só quando o usuário estiver pronto.
- Manter `deviceFilter = 'all'` por padrão.

5. Ajustar o realtime do Inbox
- Arquivo: `src/pages/InboxPage.tsx`
- No `INSERT/UPDATE` de conversations, refazer a query completa (ou hidratar a linha) em vez de inserir `payload.new` cru.
- Assim os dados continuam vindo com `agents/devices` e a lista não fica inconsistente.

O que não precisa mudar
- Sem migração SQL.
- Sem ajuste de RLS neste momento.
- Sem mexer em `device-connect`, `device-status` ou `check-webhook`, porque a URL do webhook já está certa.

Arquivos impactados
- `supabase/functions/evolution-webhook/index.ts`
- `src/pages/AgentWizard.tsx`
- `src/pages/Agents.tsx`
- `src/pages/InboxPage.tsx`

Resultado esperado
- Mensagens recebidas passam a encontrar o device correto.
- Com agente ativo no device, o sistema cria/atualiza conversations e messages.
- O Inbox passa a listar as conversas do usuário corretamente.
- Cada número continua isolado no próprio dispositivo.

Validação final
- Criar ou ativar um agente no device “Eva - 3412”.
- Enviar uma mensagem para esse número.
- Confirmar no log do webhook: `instanceName` preenchido, device encontrado, agent encontrado.
- Confirmar no `/inbox`: a conversa aparece sem precisar selecionar filtro específico.
