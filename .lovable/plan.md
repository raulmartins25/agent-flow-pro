## Novo gatilho de transferência: "Quando a IA pausar" + variável `{{resumo_conversa}}`

### 1. Wizard (Step 6)
- Adicionar opção `"on_pause"` → **"Quando o agente for pausado"** no select de gatilho de transferência (já salvo no campo `agents.transfer_trigger`).
- Adicionar novo chip clicável **📄 Resumo da conversa** que insere `{{resumo_conversa}}` no template.
- Atualizar o preview para mostrar texto-exemplo do resumo.

### 2. Nova edge function `transfer-on-pause`
- Recebe `{ conversation_id }`.
- Carrega conversa + agent + config + device + histórico de mensagens.
- Só age se `transfer_trigger === 'on_pause'`, há `transfer_number` e ainda não foi transferida.
- Gera **resumo da conversa** via Lovable AI (`google/gemini-3-flash-preview`, sem chave do usuário) — pt-BR, 6 linhas, destacando interesse, dores, dados coletados e próximo passo. Fallback: últimas 10 mensagens.
- Substitui no template: `{{nome_contato}}`, `{{telefone}}`, `{{data}}`, `{{agente}}`, `{{resumo_conversa}}`, `{{pergunta_N}}`, `{{resposta_N}}`, `{{perguntas_respostas}}`.
- Envia via Evolution API ao `transfer_number` (mesma lógica de candidatos de número que `process-message`).
- Atualiza `conversations.status = 'transferred'`.
- Registrar em `supabase/config.toml` com `verify_jwt = false`.

### 3. Disparar a função em todos os pontos de pausa
- **`src/pages/InboxPage.tsx`** — em `togglePause`, quando `newVal === true`, fire-and-forget `supabase.functions.invoke('transfer-on-pause', { body: { conversation_id }})`.
- **`supabase/functions/process-message/index.ts`** — chamar a mesma função nos blocos de blacklist (linha ~142) e desinteresse (linha ~180), onde `agent_paused` vira `true` automaticamente.

### 4. Sem mudanças de schema
Reaproveita campos existentes (`transfer_trigger`, `transfer_summary_template`). Idempotente (não duplica se já transferida).

### Arquivos
- `src/components/wizard/WizardStep6.tsx` (editar)
- `supabase/functions/transfer-on-pause/index.ts` (novo)
- `supabase/config.toml` (editar)
- `src/pages/InboxPage.tsx` (editar)
- `supabase/functions/process-message/index.ts` (editar — 2 chamadas extras)
