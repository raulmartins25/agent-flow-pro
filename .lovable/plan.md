

# Aquecimento de Chip — Menu e Página

## Visão Geral
Adicionar módulo "Aquecimento" na sidebar para conectar/desconectar instâncias WhatsApp via API do maturador (`automindhub.com.br`). Permite aquecer chips antes de usar nos agentes.

## 1. Página `/warmup` (ChipWarmupPage.tsx)

- Lista de instâncias conectadas para aquecimento (armazenadas localmente ou em nova tabela)
- Dialog "Conectar Chip" com campos:
  - **Provedor**: select com opções `evolution`, `uazapi`, `waha`
  - **URL da API**: input text
  - **Nome da instância**: input text (obrigatório para evolution/waha, opcional para uazapi)
  - **Token**: input text (opcional para waha)
- Botão **Conectar** → chama Edge Function que faz POST para `https://webhook.automindhub.com.br/webhook/jp-connect`
- Botão **Desconectar** por instância → chama Edge Function que faz POST para `https://webhook.automindhub.com.br/webhook/jp-disconnect`
- Exibe código/mensagem de retorno da API como toast

## 2. Migração: tabela `chip_warmups`

```sql
CREATE TABLE public.chip_warmups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL, -- evolution, uazapi, waha
  api_url text NOT NULL,
  instance_name text,
  token text,
  status text NOT NULL DEFAULT 'connected',
  created_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: users manage own records
```

## 3. Edge Function `chip-warmup`

- Aceita ações `connect` e `disconnect`
- `connect`: POST para `jp-connect` com body `{ provider, url, instancia, token }`
- `disconnect`: POST para `jp-disconnect` com body `{ url, instancia }`
- Retorna código e mensagem da API ao frontend

## 4. Sidebar e Rota

- Novo item: `{ title: 'Aquecimento', url: '/warmup', icon: Flame }` entre Disparos e Settings
- Rota protegida `/warmup` no App.tsx

## Arquivos

| Arquivo | Ação |
|---|---|
| Nova migração SQL | Tabela `chip_warmups` |
| `src/pages/ChipWarmupPage.tsx` | **Novo** |
| `supabase/functions/chip-warmup/index.ts` | **Novo** |
| `src/components/AppSidebar.tsx` | Add menu item |
| `src/App.tsx` | Add rota |

