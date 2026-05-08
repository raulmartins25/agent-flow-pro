## Objetivo

Criar um login restrito ("client") para a Sorria Goiás que vê apenas:
- **Inbox** filtrado no device "Sorria Parque Anhanguera" (com pausar/retomar IA + responder manual)
- **Agendamentos** (somente leitura, filtrado pelo device)
- **Transferidos** (somente leitura, filtrado pelo device)

Sem acesso a Dashboard, Agentes, Disparos, Prospecção, Aquecimento, Logs, Settings nem outros devices.

## Banco de dados

1. Adicionar valor `'client'` ao enum `app_role` (já existem admin/user).
2. Nova tabela `client_device_access`:
   - `user_id` (uuid) — usuário com role client
   - `device_id` (uuid) — device que ele pode visualizar
   - PK composta `(user_id, device_id)`
   - RLS: usuário vê só os próprios registros; insert/update/delete só por admin (`has_role(auth.uid(),'admin')`).
3. Função `public.user_can_access_device(_user uuid, _device uuid)` (security definer) → true se for dono do device OU se existir registro em `client_device_access`.
4. Atualizar/adicionar políticas RLS para que role `client` enxergue dados do device permitido:
   - `devices` SELECT: dono OU `user_can_access_device`
   - `conversations` SELECT/UPDATE: dono do agente OU device permitido (UPDATE só para `agent_paused` e via política específica)
   - `messages` SELECT/INSERT: via conversation cujo device o client tem acesso (INSERT permitido pra `role='assistant'`)
   - `appointments` SELECT: dono OU device permitido
   - Transferidos hoje vêm de `conversations` com `status='transferred'` — mesma policy de conversations cobre.

## Frontend

1. **Hook `useUserRole`** — busca role em `user_roles` + lista de `device_ids` permitidos em `client_device_access`. Cacheia no Zustand.
2. **AppSidebar** — se role = `client`, renderiza só: Inbox, Agendamentos, Transferidos (com ícone e label). Esconde toggle de tema/sair fica.
3. **ProtectedRoute / App.tsx** — guard: se role=client e rota ∉ {/inbox, /appointments, /transfers, redirect /reset-password}, redireciona pra `/inbox`. Login redireciona client direto pra `/inbox`.
4. **InboxPage** — quando role=client:
   - Esconde dropdown de filtro de devices e força `deviceFilter = device_ids[0]`.
   - Esconde botão "Criar conversa de teste".
   - Mantém pausar/retomar e envio manual (já funciona via RLS).
5. **AppointmentsPage / TransfersPage** — quando role=client:
   - Filtra automaticamente pelo `device_id` permitido.
   - Esconde botões de ação (cancelar, editar, marcar atendido). Apenas visualização.

## Provisionamento do usuário Sorria

1. Criar usuário no auth (via tela de signup com email/senha que você definir, ou pedir pra você me passar o email).
2. Após criação:
   - `INSERT INTO user_roles (user_id, role) VALUES (<id>, 'client')`
   - `INSERT INTO client_device_access (user_id, device_id) VALUES (<id>, '<id do device Parque Anhanguera>')`

## Detalhes técnicos

- Enum: `ALTER TYPE app_role ADD VALUE 'client';`
- Função helper:
  ```sql
  CREATE FUNCTION public.user_can_access_device(_user uuid, _device uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
    SELECT EXISTS (SELECT 1 FROM devices WHERE id=_device AND user_id=_user)
        OR EXISTS (SELECT 1 FROM client_device_access WHERE user_id=_user AND device_id=_device);
  $$;
  ```
- Policies de conversations passam a usar `user_can_access_device(auth.uid(), device_id)` em adição à checagem por agente.
- UPDATE de `conversations` pelo client é restrito a alterar `agent_paused` (controlado via policy `WITH CHECK` que mantém demais campos imutáveis ou via trigger simples).
- Roteamento: novo componente `RoleGate` em volta do `<Routes>` para client.

## Pergunta antes de implementar

Preciso do **email e senha inicial** do usuário Sorria Goiás (ou você prefere se cadastrar pela tela de signup e me passar o email pra eu atribuir a role + device)?
