

## Correção: endpoints Ecuro reais

A documentação mostra os endpoints corretos. Eu estava chutando — agora tenho os nomes reais.

### Endpoints corretos

| Função | Endpoint atual (errado) | Endpoint correto | Método |
|---|---|---|---|
| Listar clínicas | `/list-clinics-webhook` POST | `/list-clinics` | **GET** |
| Listar especialidades | `/list-specialties-webhook` POST | `/list-specialties` | **GET** (clinicId via query) |
| Disponibilidade | `/specialty-availability-webhook` POST | `/specialty-availability` | **GET** (clinicId/specialtyId/startDate/endDate via query) |
| Criar agendamento | `/create-appointment-webhook` POST | `/create-appointment-webhook` | **POST** (já está certo) |

### Mudanças

**`supabase/functions/ecuro-list-clinics/index.ts`**
- Trocar para `GET /list-clinics`, sem body.

**`supabase/functions/ecuro-list-specialties/index.ts`**
- Trocar para `GET /list-specialties?clinicId=...`, sem body.

**`supabase/functions/ecuro-availability/index.ts`**
- Trocar para `GET /specialty-availability?clinicId=...&specialtyId=...&startDate=...&endDate=...`, sem body.

**`supabase/functions/_shared/ecuro.ts`**
- Sem mudança estrutural; ela já aceita qualquer método. Só os callers mudam.

**`supabase/functions/ecuro-schedule/index.ts`**
- Mantém `POST /create-appointment-webhook` (já correto).

### Validação após implementar

1. Abrir `/agents/new` → Step 7 → ativar Ecuro → ambiente Dev.
2. Dropdown "Clínica" deve carregar a lista.
3. Selecionar clínica → "Especialidade" deve carregar.
4. Salvar agente.

Se algum endpoint retornar formato inesperado, o `extractList()` no `WizardStep7` já tenta múltiplas chaves (`data`, `items`, `clinics`, etc.), então deve funcionar sem mudança no front.

