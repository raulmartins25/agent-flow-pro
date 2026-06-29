## Escopo

Implementar o **PROMPT 2** (Localização + Convênio para a Jordana). Prompts 1 e 3 já foram concluídos.

Nada do fluxo atual (agendamento Ecuro, objeções existentes, anti-ban, transferência, Regra 8 da única unidade que agenda) será tocado fora do estritamente necessário.

---

## 1) Banco — tabela `clinic_units`

Migration criando:

```
clinic_units (
  id uuid pk,
  brand text,
  name text not null,
  city text,
  state text,
  neighborhoods text[],
  phone text,
  maps_link text,
  schedules_via_ecuro bool default false,
  notes text,
  created_at, updated_at
)
```

- GRANTs: `service_role` ALL + `authenticated` SELECT.
- RLS ON; policy SELECT para `authenticated`.
- Seed com **49 unidades** (confirmado na contagem). Parque Anhanguera com `schedules_via_ecuro = true`. Santo Hilário e Vila Nova com `phone`/`maps_link` vazios.

---

## 2) Nova edge function `find-nearest-unit`

`supabase/functions/find-nearest-unit/index.ts` (verify_jwt = false).

Input: `{ query: string }`.

Algoritmo (normalização sem acento, lowercase):
1. Match exato em qualquer item de `neighborhoods`.
2. Match parcial em `neighborhoods` (contains).
3. Match em `city` ou `name`.
4. Saída:
   - 1 → `{ status: "single", unit }`
   - 2+ → `{ status: "multiple", units }` (até 3)
   - 0 → `{ status: "not_found" }`

Campos retornados: `name, brand, city, state, phone, maps_link, schedules_via_ecuro`.

---

## 3) Registrar tool no `process-message`

- Adicionar `find_nearest_unit` ao array `ecuroTools` (não afeta agentes sem Ecuro).
- Branch novo em `runEcuroTool` fazendo fetch para `find-nearest-unit`.
- Sem mudanças em `get_availability` / `schedule_appointment`.

---

## 4) Atualizar `src/lib/compilePrompt.ts`

Acréscimos dentro do bloco condicional `ecuro_enabled`:

- Reforço da Regra 8: `schedule_appointment` SÓ pode ser chamado para Parque Anhanguera, independente do retorno de `find_nearest_unit`.
- Instrução de localização:
  - Lead menciona bairro/cidade/"tem unidade em X?" → chamar `find_nearest_unit`.
  - Responder com nome + telefone + Maps; deixar claro que só a Parque Anhanguera agenda por aqui, as demais o paciente contacta direto.
  - Tratamento dos 3 status (single / multiple / not_found).
  - Não chamar quando já em fluxo de agendamento na Parque Anhanguera.

---

## 5) Config da Jordana

UPDATE em `agents` adicionando o handler "convênio" ao JSON `objection_handlers` com a resposta exata fornecida. Sem outras mudanças.

---

## 6) Testes isolados

1. `find-nearest-unit` via curl: "Trindade" → 2, "Parque Amazônia" → 2, "Garavelo" → 1, "Quirinópolis" → 1, "Marte" → not_found.
2. Simulador Jordana:
   - Endereço sem citar bairro → dados fixos do Parque Anhanguera (não regrediu).
   - "Moro em Trindade" → IA chama tool, lista as 2 com telefone+Maps, reforça que só Parque Anhanguera agenda.
   - "Aceitam meu plano?" → nova resposta do handler convênio.
3. Agendamento normal Parque Anhanguera (Ecuro) → não regrediu.

Reporto evidências e confirmo que agendamento/transferência/anti-ban continuam iguais.

---

## Arquivos

- Novos: migration + seed; `supabase/functions/find-nearest-unit/index.ts`.
- Editados: `supabase/functions/process-message/index.ts`, `src/lib/compilePrompt.ts`, `supabase/config.toml`.
- UPDATE em `agents` (objection_handlers da Jordana).
- Não tocados: `_shared/ecuro.ts`, `ecuro-availability`, `ecuro-schedule`, `ecuro-cancel`, `ecuro-confirm`, wizard, inbox, relatórios.
