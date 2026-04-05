

# Página de Logs — Visualizar processamento e transferências

## O que será criado

Uma nova página "Logs" acessível pela sidebar, mostrando um histórico das conversas processadas com foco em transferências, erros e status.

## Implementação

### 1. Nova página `src/pages/LogsPage.tsx`

- Consulta a tabela `conversations` com joins em `agents` e `messages`
- Mostra uma tabela com colunas: Data, Agente, Contato, Status (active/transferred/closed), Última msg
- Filtros: por status (transferred, closed, active), por agente, por data
- Highlight visual para conversas transferidas (badge verde) e com erro (badge vermelho)
- Ordenação por `last_message_at` desc

### 2. Sidebar — `src/components/AppSidebar.tsx`

- Adicionar item "Logs" com ícone `ScrollText` entre "Aquecimento" e "Settings"

### 3. Router — `src/App.tsx`

- Adicionar rota `/logs` → `LogsPage`

### Detalhes da tabela de logs

| Coluna | Fonte |
|---|---|
| Data/Hora | `conversations.last_message_at` |
| Agente | `agents.name` via `agent_id` |
| Contato | `conversations.contact_number` + `contact_name` |
| Status | Badge colorido: active (azul), transferred (verde), closed (cinza) |
| Mensagens | Count de messages na conversa |
| Ação | Botão para abrir no Inbox |

### Arquivos impactados

| Arquivo | Mudança |
|---|---|
| `src/pages/LogsPage.tsx` | Nova página com tabela de logs |
| `src/components/AppSidebar.tsx` | Adicionar item "Logs" |
| `src/App.tsx` | Adicionar rota `/logs` |

