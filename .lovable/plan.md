

# Corrigir Blacklist — normalização + vincular a dispositivo

## Bug 1 — Blacklist não funciona

**Causa raiz**: O número é salvo no banco como digitado (ex: `556299542888` — 12 dígitos). O webhook normaliza com `canonicalPhone()` que insere o 9 (→ `5562999542888` — 13 dígitos). A comparação falha porque os formatos são diferentes.

**Correção**: Tanto no webhook quanto no blast-processor, comparar o phone da blacklist também canonicalizado. Além disso, ao **salvar** na UI, aplicar `canonicalPhone()` para garantir formato 13 dígitos.

## Bug 2 — Blacklist deve ser por dispositivo (instância)

**Problema**: Atualmente `blacklist` tem apenas `user_id` + `phone`. O usuário quer que a blacklist seja por número/dispositivo específico.

**Correção**:

### Migration SQL
- Adicionar coluna `device_id uuid REFERENCES devices(id) ON DELETE CASCADE` à tabela `blacklist`
- Dropar constraint unique atual e criar nova: `UNIQUE(user_id, device_id, phone)`

### Edge Functions

**`evolution-webhook/index.ts`**: Na checagem de blacklist, adicionar `.eq("device_id", device.id)` além do `user_id`. Comparar usando `canonicalPhone()` no phone armazenado também (usar `.or()` com ambos os formatos).

**`blast-processor/index.ts`**: Buscar o `device_id` da campanha (via agent → device_id) e filtrar blacklist por `device_id`. Usar `canonicalPhone` na comparação.

### UI — `src/pages/SettingsPage.tsx`

1. Carregar lista de devices do usuário para um select
2. Adicionar select "Dispositivo" obrigatório no modal de adicionar número
3. Mostrar coluna "Dispositivo" na tabela de blacklist
4. Filtrar blacklist por device selecionado (ou mostrar todos com label do device)
5. Na importação CSV, exigir seleção de device antes de importar

## Arquivos impactados

| Arquivo | Mudança |
|---|---|
| Migration SQL | Adicionar `device_id` à `blacklist`, nova constraint unique |
| `supabase/functions/evolution-webhook/index.ts` | Filtrar blacklist por `device_id` + canonicalizar comparação |
| `supabase/functions/blast-processor/index.ts` | Filtrar blacklist por `device_id` do agent |
| `src/pages/SettingsPage.tsx` | Select de device, coluna device na tabela, normalização canonical ao salvar |

