

## Correção: Base URL da Ecuro

### Causa do 404

A base URL correta é `https://clinics.api.dev.ecuro.com.br/api/v1/ecuro-light` (faltava `/ecuro-light` no final). Por isso todas as chamadas GET/POST estavam batendo em rota inexistente.

### Mudanças

**`supabase/functions/_shared/ecuro.ts`**
- Atualizar `getEcuroBase()`:
  - dev → `https://clinics.api.dev.ecuro.com.br/api/v1/ecuro-light`
  - prod → `https://clinics.api.ecuro.com.br/api/v1/ecuro-light` (mesmo padrão, assumindo simetria — ajustável depois se prod for diferente)

Nenhuma outra mudança necessária. Os 4 edge functions (`ecuro-list-clinics`, `ecuro-list-specialties`, `ecuro-availability`, `ecuro-schedule`) já usam os paths corretos da documentação (`/list-clinics`, `/list-specialties`, `/specialty-availability`, `/create-appointment-webhook`) e os métodos certos (GET para os 3 primeiros, POST para o último).

### Validação após implementar

1. `/agents/new` → Step 7 → ativar Ecuro → Dev.
2. Dropdown "Clínica" deve carregar a lista real.
3. Selecionar clínica → especialidades carregam.
4. Se prod retornar 404 quando você testar, me avisa o base URL de prod que eu ajusto.

