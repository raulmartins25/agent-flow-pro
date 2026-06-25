## Objetivo

Permitir cadastrar/gerenciar instâncias Evolution **exclusivas do Aquecimento 2**, totalmente isoladas da tabela `devices` (usada por Dispositivos e Agentes). Nada do que já existe é tocado.

## O que muda

### Backend (nova tabela isolada)

Criar `public.warmup_evolution_instances` — registro apenas para warmup:

- `id`, `user_id`, `label` (apelido), `evolution_api_url`, `instance_name`, `evolution_api_key`, `created_at`
- RLS scoped a `auth.uid()` (somente o dono enxerga/edita)
- GRANTs padrão para `authenticated` + `service_role`

Essa tabela é **separada de `devices`** — não aparece em Dispositivos, não é vinculável a Agentes, não interfere em nada existente.

### Edge function `chip-warmup-v2`

Aceitar um novo parâmetro alternativo `warmup_instance_id` (além do `device_id` que já existe). Quando recebido, resolve URL/instância/token a partir de `warmup_evolution_instances` em vez de `devices`. Resto da lógica (Basic Auth, chamada ao maturador Raul, inserção em `chip_warmups`) permanece igual.

### Frontend `ChipWarmup2Page.tsx`

No modal de "Conectar Chip", quando provedor = Evolution, mostrar **dois grupos** no select:

```text
Evolution
├── Meus Dispositivos (devices)
│   ├── Sorria Parque Anhanguera — ...
│   └── ...
└── Aquecimento (warmup_evolution_instances)
    ├── Evolution Secundária — instância X
    └── + Cadastrar nova Evolução de aquecimento
```

Adicionar uma seção/sub-página "Gerenciar Evoluções de Aquecimento" com:
- Botão "Adicionar Evolução" (modal com: apelido, URL, instância, API key)
- Lista das instâncias cadastradas com botão de excluir
- Não conecta nem cria instância no Evolution — só guarda credenciais para enviar ao maturador

## Garantias de não-interferência

- Nada é lido/escrito em `devices`, `agents` ou `agent_integrations`
- `chip_warmups` continua sendo o histórico (campo `instance_name` distingue as origens)
- Aquecimento 1 (`/warmup`) não é alterado

## Arquivos afetados

- **Novo**: migração SQL para `warmup_evolution_instances` (tabela + RLS + GRANTs)
- **Editado**: `supabase/functions/chip-warmup-v2/index.ts` (suporte a `warmup_instance_id`)
- **Editado**: `src/pages/ChipWarmup2Page.tsx` (select agrupado + CRUD da lista de Evoluções de warmup)
