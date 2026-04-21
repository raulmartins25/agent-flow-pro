

## Corrigir link público do simulador

### Causa

A página pública `/simulator/share/:token` valida o token corretamente, mas em seguida tenta ler `agents` e `agent_config` — duas tabelas cuja RLS exige `auth.uid() = user_id`. Como o visitante não está logado, as queries voltam vazias e a página mostra "Link expirado ou inválido".

### Solução: edge function pública

Criar uma edge function `public-simulator-agent` (com `verify_jwt = false`) que:
1. Recebe `{ token }`.
2. Valida o token usando o **service role key** (bypassa RLS) — verifica `expires_at > now()`.
3. Retorna apenas os campos necessários do `agents` e `agent_config` (nada de `llm_api_key`, `evolution_api_key`, etc — só o que o simulador precisa).
4. Se token inválido/expirado, retorna 404.

E criar **`public-simulator-chat`** (também `verify_jwt = false`) que:
1. Recebe `{ token, messages }`.
2. Valida o token novamente (segurança).
3. Carrega prompt + credenciais LLM do agente no servidor (o cliente público nunca vê as chaves).
4. Chama DeepSeek/OpenAI/Lovable AI usando a mesma lógica do `simulate-chat` atual.
5. Retorna `{ response }`.

### Mudanças

**`supabase/functions/public-simulator-agent/index.ts`** (novo)
- GET/POST com token → retorna `{ agent: { id, name, type }, config: { agent_persona_name, company_name, welcome_message, first_prospecting_message, qualification_questions } }`.

**`supabase/functions/public-simulator-chat/index.ts`** (novo)
- POST `{ token, messages }` → valida, carrega agente via service role, executa LLM, retorna resposta. Reutiliza a lógica de normalização de modelo do `simulate-chat`.

**`supabase/config.toml`**
- Adicionar `[functions.public-simulator-agent]` e `[functions.public-simulator-chat]` com `verify_jwt = false`.

**`src/pages/PublicSimulatorPage.tsx`**
- Trocar as queries diretas ao Supabase por chamadas às duas edge functions.
- Manter UI atual (header, mensagens, input, transferred badge).
- Nunca enviar `llm_api_key` do cliente — agora vem do servidor.

### Segurança

- Chaves de LLM e Evolution **nunca** trafegam para o cliente público.
- Apenas campos seguros são expostos (nome do agente, persona, mensagens de boas-vindas, perguntas de qualificação).
- Token continua expirando em 7 dias (já existe).
- RLS atual permanece intocada — apenas o backend valida e bypassa via service role de forma controlada.

### Validação

1. Página `/agents/:id/simulator` → Compartilhar → copiar link.
2. Abrir o link em aba anônima (sem login).
3. Deve carregar a Jordana com mensagem de boas-vindas.
4. Enviar mensagem → resposta real do DeepSeek.
5. Após 7 dias (ou se deletar o token), mostrará "Link expirado ou inválido".

