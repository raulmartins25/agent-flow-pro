

# Sistema de Blacklist de Números

## 1. Migration SQL
Criar tabela `blacklist` com `user_id`, `phone`, `label`, constraint unique `(user_id, phone)`, RLS scoped por `auth.uid()`.

## 2. Edge Functions

### `evolution-webhook/index.ts`
Após encontrar o `agent` (linha ~93), antes do lookup de conversas:
- Normalizar `remoteJid` (só dígitos)
- Consultar `blacklist` com `user_id = agent.user_id` e match no phone normalizado
- Se encontrado, retornar 200 e ignorar completamente

### `blast-processor/index.ts`
Dentro do loop de contatos (linha ~130), após skip de duplicatas e antes do claim:
- Normalizar `contact.phone`
- Consultar `blacklist` com `user_id = campaign.user_id`
- Se encontrado, marcar contato como `error` com mensagem "Número na blacklist" e `continue`

## 3. UI — Nova aba "Blacklist" em Settings

### `src/pages/SettingsPage.tsx`
Adicionar terceira aba "Blacklist" com:

**Listagem:**
- Tabela: Número | Label | Data | Ação (botão remover)
- Estado vazio: "Nenhum número bloqueado ainda"
- Carrega via `supabase.from('blacklist').select('*').eq('user_id', user.id)`

**Adicionar número:**
- Dialog com campos Número (obrigatório) e Label (opcional)
- Ao salvar: normalizar phone (só dígitos), inserir com `user_id`

**Importar CSV:**
- Botão "Importar CSV" usando Papa Parse
- Detecta coluna `telefone`/`phone`, opcionalmente `label`
- Insere em batch, toast com contagem

**Remover:**
- Botão de delete por ID, com confirmação

## Arquivos impactados

| Arquivo | Mudança |
|---|---|
| Migration SQL | Criar tabela `blacklist` com RLS |
| `supabase/functions/evolution-webhook/index.ts` | Checar blacklist antes de processar mensagem |
| `supabase/functions/blast-processor/index.ts` | Pular contatos na blacklist durante disparo |
| `src/pages/SettingsPage.tsx` | Nova aba Blacklist com CRUD + import CSV |

