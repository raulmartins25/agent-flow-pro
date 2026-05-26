# Bug: Jordana agendou 16:15 num sábado (clínica fecha 14:00)

## Diagnóstico

Na conversa anexada:
1. Jordana ofereceu **08:30 ou 13:15** (vindos do `get_availability`).
2. Paciente respondeu **"As 13hs e 15, é melhor"**.
3. Jordana chamou `schedule_appointment` com `start_time = 16:15` — horário que **nunca foi oferecido** e que está **fora do expediente de sábado**.

Duas falhas se somam:

- **A. Sem trava de horário comercial.** A integração Ecuro hoje devolve qualquer slot que a API retornar. Não há `business_hours` configurável por dia da semana, então 16:15 de sábado pode passar adiante se a Ecuro tiver agenda aberta lá.
- **B. Sem validação do `start_time` no servidor.** `ecuro-schedule` aceita cegamente o ISO que o LLM mandar. Quando o modelo "alucina" (13:15 → 16:15, comum quando o histórico fica longo e ele perde o slot ISO original), nada barra.

O prompt já manda "use o ISO exato retornado por get_availability", mas instrução de prompt não é garantia — precisa de verificação determinística.

## O que vou implementar

### 1. Config de horário de funcionamento por agente
- Adicionar `business_hours` ao `config` JSONB de `agent_integrations` (provider `ecuro`). Estrutura:
  ```
  business_hours: {
    "0": null,                                 // dom fechado
    "1": [{ open: "08:00", close: "18:00" }],  // seg
    ...
    "6": [{ open: "08:00", close: "14:00" }]   // sáb
  }
  ```
- Editor na página de integração Ecuro do agente (uma linha por dia da semana com toggle "fechado" e inputs open/close; permite múltiplos intervalos para almoço).

### 2. Filtro determinístico em `ecuro-availability`
- Ler `business_hours` do config.
- Antes de devolver os slots, descartar qualquer `start` cujo HH:MM (em America/Sao_Paulo) caia fora dos intervalos do dia da semana correspondente. Assim o LLM nunca vê 16:15 de sábado.

### 3. Validação em `ecuro-schedule`
- Antes de chamar a Ecuro para criar:
  1. Re-checar `business_hours` para o `start_time` recebido — se fora do expediente, retornar `400 { error: "outside_business_hours" }`.
  2. Buscar disponibilidade do dia e confirmar que o `start_time` (HH:MM + data) bate com algum slot retornado. Se não bater, retornar `400 { error: "slot_not_offered" }`.
- O `process-message` repassa o erro como `tool_result` para o LLM, que então pede desculpas e oferece os slots reais novamente (sem criar nada).

### 4. Reforço no prompt
- Em `compilePrompt.ts`, deixar explícito: "Ao chamar `schedule_appointment`, copie o `start` (ISO) do slot exato — proibido inferir, somar minutos ou reescrever a hora. Se em dúvida, chame `get_availability` de novo antes."

## Arquivos afetados

- `supabase/migrations/<novo>.sql` — nada de schema; config vive no JSONB existente.
- `supabase/functions/ecuro-availability/index.ts` — aplicar filtro `business_hours`.
- `supabase/functions/ecuro-schedule/index.ts` — validar `start_time` contra `business_hours` e contra slots ofertados.
- `supabase/functions/_shared/ecuro.ts` — helper `isWithinBusinessHours(iso, businessHours)`.
- `src/pages/AgentWizard.tsx` ou a tela onde a integração Ecuro é configurada (verificar qual) — UI do horário de funcionamento.
- `src/lib/compilePrompt.ts` — reforçar instrução do ISO.

## Detalhes técnicos

- Comparação de horário sempre em `America/Sao_Paulo` via `Intl.DateTimeFormat` com `timeZone`, nunca em UTC bruto, para evitar deslocamento de fuso.
- `business_hours` opcional: se ausente, comportamento atual é mantido (sem filtro), para não quebrar agentes já configurados.
- Mensagem de erro do `ecuro-schedule` é em PT-BR amigável para o LLM repetir ao paciente.
