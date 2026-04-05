

# Módulo de Dispositivos — Plano Completo

## Visão Geral
Criar sistema de dispositivos WhatsApp como entidade central de conexão com a Evolution API. Agentes passam a referenciar um dispositivo em vez de guardar credenciais diretamente. Isolamento total por device_id em todas as camadas.

---

## 1. Migração SQL

```sql
-- Enum para status do device
CREATE TYPE device_status AS ENUM ('disconnected', 'connecting', 'connected', 'error');

-- Tabela devices
CREATE TABLE public.devices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  evolution_api_url text NOT NULL,
  evolution_api_key text NOT NULL,
  instance_name text NOT NULL,
  phone_number text,
  status device_status NOT NULL DEFAULT 'disconnected',
  qr_code text,
  last_connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own devices" ON public.devices FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Adicionar device_id aos agents
ALTER TABLE public.agents ADD COLUMN device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL;

-- Adicionar device_id e instance_name às conversations
ALTER TABLE public.conversations ADD COLUMN device_id uuid REFERENCES public.devices(id);
ALTER TABLE public.conversations ADD COLUMN instance_name text;

-- Remover colunas Evolution dos agents (agora vêm do device)
ALTER TABLE public.agents DROP COLUMN IF EXISTS evolution_api_url;
ALTER TABLE public.agents DROP COLUMN IF EXISTS evolution_api_key;
ALTER TABLE public.agents DROP COLUMN IF EXISTS evolution_instance;
```

## 2. Nova Página — DevicesPage.tsx

**Rota:** `/devices` (protegida)

- Grid de cards com cada dispositivo: nome, número, badge de status (verde/amarelo/vermelho/cinza)
- Botão "Adicionar dispositivo" abre modal com campos: nome, URL Evolution, API Key, instância
- Modal "Gerenciar" com:
  - QR Code quando `status = 'connecting'` (auto-refresh 30s, polling status 5s)
  - Info de número conectado quando `status = 'connected'`
  - Botões: Conectar/Desconectar/Reconectar/Excluir
  - Lista de agentes vinculados ao dispositivo

## 3. Sidebar e Rota

- Novo item: `{ title: 'Dispositivos', url: '/devices', icon: Smartphone }` entre Dashboard e Agentes
- Rota `/devices` no App.tsx

## 4. Edge Functions — 3 novas

**device-connect:** Recebe `{ device_id }`, busca device, chama Evolution `POST /instance/create` ou `GET /instance/connect/:instance`, salva QR, atualiza status para `connecting`.

**device-status:** Recebe `{ device_id }`, chama `GET /instance/connectionState/:instance`, atualiza status/phone_number.

**device-disconnect:** Recebe `{ device_id }`, chama `DELETE /instance/logout/:instance`, limpa phone_number/qr_code, status `disconnected`.

## 5. Wizard Step 1 — Substituir campos Evolution

- Remover campos: URL, API Key, instância
- Substituir por dropdown "Dispositivo WhatsApp" que lista devices com `status = 'connected'`
- Cada opção: nome + número
- Se vazio: "Nenhum dispositivo conectado" + link para `/devices`
- Salvar `device_id` no wizard/agente

**agentStore.ts:** Trocar `evolution_api_url`, `evolution_api_key`, `evolution_instance` por `device_id: string`.

**AgentWizard.tsx:** Validação step 0: trocar validação dos 3 campos por `device_id`. Insert usa `device_id` em vez dos campos removidos.

## 6. Edge Functions Existentes — Migrar para JOIN com devices

**evolution-webhook/index.ts:**
- Identificar device pelo `instance_name` do payload
- Buscar device: `SELECT * FROM devices WHERE instance_name = $1`
- Buscar agente: `SELECT * FROM agents WHERE device_id = $device_id AND status = 'active'`
- Buscar/criar conversa filtrando por `agent_id + device_id`
- Usar credenciais do device para tudo

**process-message/index.ts:**
- Buscar agente com JOIN devices: `agents(*, agent_config(*), devices(*))`
- Usar `device.evolution_api_url`, `device.evolution_api_key`, `device.instance_name` para enviar mensagens
- Remover referências a `agentFull.evolution_*`

**blast-processor/index.ts:**
- JOIN com devices ao buscar agente
- Verificar `device.status === 'connected'` antes de iniciar
- Se desconectado: pausar campanha com erro
- Usar credenciais do device para envios

**followup-cron/index.ts:**
- JOIN com devices ao buscar agents
- Usar credenciais do device

**send-media/index.ts:**
- Buscar agent com JOIN devices
- Usar credenciais do device

## 7. Inbox — Filtro por Dispositivo

- Dropdown no topo: "Todos" + lista de devices
- Filtrar conversas por `device_id`
- Badge com nome do device no header de cada conversa

## 8. Validações

- Um device só pode ter UM agente ativo (verificação no wizard ao salvar)
- Ao desconectar device: agentes vinculados ficam `inactive`
- Ao excluir device: `device_id = null` nos agentes (ON DELETE SET NULL já cobre)

---

## Arquivos Impactados

| Arquivo | Ação |
|---|---|
| Nova migração SQL | Tabela `devices`, ALTER `agents` e `conversations` |
| `src/pages/DevicesPage.tsx` | **Novo** — página completa |
| `src/components/AppSidebar.tsx` | Novo item menu |
| `src/App.tsx` | Nova rota `/devices` |
| `src/stores/agentStore.ts` | `device_id` em vez de campos Evolution |
| `src/components/wizard/WizardStep1.tsx` | Dropdown de devices |
| `src/pages/AgentWizard.tsx` | Validação e insert adaptados |
| `src/pages/Agents.tsx` | Mostrar device vinculado no card |
| `src/pages/InboxPage.tsx` | Filtro por device + badge |
| `supabase/functions/device-connect/index.ts` | **Novo** |
| `supabase/functions/device-status/index.ts` | **Novo** |
| `supabase/functions/device-disconnect/index.ts` | **Novo** |
| `supabase/functions/evolution-webhook/index.ts` | Isolamento por device |
| `supabase/functions/process-message/index.ts` | Credenciais via device |
| `supabase/functions/blast-processor/index.ts` | Credenciais via device + check status |
| `supabase/functions/followup-cron/index.ts` | Credenciais via device |
| `supabase/functions/send-media/index.ts` | Credenciais via device |

