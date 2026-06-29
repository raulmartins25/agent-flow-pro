## Escopo
Corrigir somente os dois bugs identificados no diagnóstico Ecuro. Não tocar em prompt da Jordana, no fluxo de objeções, no `ecuro-availability`, no `ecuro-cancel`, nem em qualquer guard já existente. Só `ecuro-schedule` e `ecuro-confirm`, mais uma migration mínima e uma contagem de dados (sem alterar registros).

## Varredura de dados (já feita, sem alteração)
Sobre `appointments` (total = 95):
- **2 registros com `external_id` vazio/NULL**
- 0 com `external_id` "literal ruim" (`null`, `undefined`, `[object Object]`)
- 0 com `external_id` suspeito curto (<8 chars)
- 1 com status `cancelled`/`completed`

Ou seja, o universo de "lixo" hoje é pequeno (2 linhas). Não vou corrigir dados existentes nesta task, conforme pedido.

## Mudanças

### 1) `ecuro-schedule` — bloquear "data no passado"
Antes do GUARD 1 (business hours), inserir um novo **GUARD 0**:
- Calcula `nowPlus5 = Date.now() + 5*60*1000`.
- Se `start.getTime() <= nowPlus5`, **não chama a Ecuro**.
- Insere em `messages` (mesmo padrão dos outros):
  `[Ecuro] BLOQUEADO_horario_passado: tentativa de agendar <start BR> (agora=<now BR>).`
- Retorna 400 estruturado para o LLM:
  ```json
  { "success": false, "error": "start_in_past",
    "message": "Horário já passou. Chame get_availability novamente e ofereça apenas horários futuros (mínimo 5 min de antecedência)." }
  ```

### 2a) `ecuro-schedule` — extração robusta de `external_id`
Hoje o código faz:
```ts
const appt = data.data?.appointment || data.appointment || data.data || data;
const externalId = appt.id || appt.appointmentId || appt.appointment_id || appt._id || null;
```
Mudanças:
- Adicionar mais chaves candidatas: `external_id`, `uuid`, `appointmentUuid`, e tentar também `data?.data?.id`.
- Função `extractExternalId(payload)` que percorre os caminhos e devolve `string` apenas se for não-vazio e diferente de `"null"`/`"undefined"`/`"[object Object]"`.
- Se a extração **falhar** após `res.ok = true`:
  - Ainda insere o `appointments` (para não perder o registro), mas com `external_id = NULL` e `status = 'pending_external_id'`.
  - Loga em `messages`: `[Ecuro] AVISO_external_id_ausente: payload=<json truncado>`.
  - Retorna `success: true` para o LLM (o paciente já está agendado na Ecuro), mas inclui `warning: "external_id_missing"` no JSON — o fluxo do LLM atual ignora campos extras, então não impacta.
- **Não** marcar como "confirmado": já não marca hoje (`status` default é `scheduled`); só garantir o novo `pending_external_id` quando faltar id.

> Requer um pequeno passo de schema: permitir `'pending_external_id'` no enum/check de `appointments.status` (se houver). Vou verificar antes de aplicar — se for `text` livre, sem migration. Se for enum, migration mínima `ALTER TYPE ... ADD VALUE`.

### 2b) `ecuro-confirm` — pular agendamentos cancelados/inativos
Logo após carregar `appt`, antes da checagem de `external_id`:
```ts
if (['cancelled','completed','no_show'].includes(appt.status)) {
  // log e pula
  return { ok: true, skipped: true, reason: 'appointment_inactive' };
}
```
Loga em `messages` (se houver `conversation_id`):
`[Ecuro] SKIP_confirm: status=<status>, id=<appt.id>`.

### 2c) Mismatch de ambiente dev/prod
Hoje **não há coluna** que registre em qual ambiente o appointment foi criado. Sem essa info não dá pra evitar mismatch nos registros antigos. Proposta cirúrgica:
- Migration: `ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS ecuro_environment text;` (nullable, sem default).
- `ecuro-schedule` passa a gravar `ecuro_environment: env` no insert.
- `ecuro-confirm`: se `appt.ecuro_environment` existir **e** for diferente do `env` atual da `agent_integrations.config.environment`, **não chama a Ecuro**, loga `[Ecuro] SKIP_confirm: env_mismatch (criado=<x>, atual=<y>)` e retorna `{ ok: true, skipped: true, reason: 'env_mismatch' }`.
- Para registros antigos (`ecuro_environment IS NULL`), comportamento **inalterado** (segue tentando normalmente) — assim não muda nada nos casos que hoje funcionam.

### 2d) Varredura
Já feita acima (95 total / 2 com external_id vazio / 0 outros casos suspeitos). Sem alterações nos dados.

## Arquivos tocados
- `supabase/functions/ecuro-schedule/index.ts` — GUARD 0, extractor robusto, gravação de `ecuro_environment`, status `pending_external_id` quando id vier vazio.
- `supabase/functions/ecuro-confirm/index.ts` — skip de status inativo, skip por env mismatch.
- **1 migration** mínima: `ADD COLUMN ecuro_environment text` em `appointments` (e, se necessário, ampliação do enum de `status`).

## Não toco
- `_shared/ecuro.ts`, `ecuro-availability`, `ecuro-cancel`, `compilePrompt.ts`, prompts da Jordana, GUARD 1/2 existentes, lógica de objeções/preço, agendamentos já gravados.

## Validação após implementar
- **Schedule normal (futuro, dentro do expediente)**: continua criando na Ecuro e gravando `appointments` com `external_id` preenchido + `ecuro_environment`.
- **Schedule no passado**: bloqueado localmente, sem chamada à Ecuro, log `BLOQUEADO_horario_passado`.
- **Schedule fora do expediente**: continua bloqueado pelo GUARD 1 (inalterado).
- **Confirm de agendamento ativo recente**: chama Ecuro normalmente.
- **Confirm de cancelado**: pula com log, não chama Ecuro.
- **Confirm de registro antigo (sem `ecuro_environment`)**: comportamento atual preservado.
- **Cancel**: inalterado.

Vou rodar testes pontuais via `supabase--curl_edge_functions` (schedule no passado + confirm em appointment cancelado) e reportar resultado, sem mexer em fluxos OK.