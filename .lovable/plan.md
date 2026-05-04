## Resposta curta

**Sim**, em produção o telefone já vem do WhatsApp via webhook da Evolution API e é injetado automaticamente no `schedule_appointment` (linha 325 do `process-message`). O agente **não precisa perguntar**.

O que está acontecendo: o **prompt da Jordana** ainda diz "use nome+telefone que já temos da conversa", mas não proíbe explicitamente de pedir telefone. Os LLMs (DeepSeek/GPT) acabam pedindo por costume/educação, principalmente no simulador onde o `contact_number` é fake.

## O que fazer

### 1. Ajustar regras de agendamento no prompt (`src/lib/compilePrompt.ts`)

Trocar a regra atual por uma versão explícita:

- **Regra 4 (nova):** NUNCA pedir telefone/WhatsApp — o sistema já tem o número (paciente está no WhatsApp). Pedir apenas **nome completo** se ainda não souber. CPF/email/data de nascimento são **opcionais**: só usar se o paciente oferecer; não bloquear agendamento por falta deles.

### 2. Garantir telefone no simulador também

No `simulate-chat`, o `runTool` já passa `patient_phone: args.patient_phone || "5500000000000"` como fallback. Vou confirmar que esse fallback continua suficiente para teste em modo dry-run e real (em real ele cria agendamento de teste com esse número placeholder — aceitável para validação).

### 3. (Opcional) Reforçar no schema da tool

No `ECURO_TOOLS` do `simulate-chat`, remover `patient_phone` da descrição da função para o LLM não ser tentado a coletar. Em produção (`process-message`) verificar se a tool definition expõe `patient_phone` — se sim, remover de lá também já que é injetado server-side.

## Arquivos a editar

- `src/lib/compilePrompt.ts` — atualizar bloco AGENDAMENTO AUTOMATIZADO (linhas 199–210)
- `supabase/functions/process-message/index.ts` — confirmar que tool schema do `schedule_appointment` não pede `patient_phone` ao LLM (vou inspecionar antes de mexer)

## Efeito esperado

Jordana, após paciente escolher horário, dirá algo como:
> "Perfeito! Pra finalizar, me confirma seu nome completo? 😊"

E chamará `schedule_appointment` direto, sem pedir telefone.

## Observação importante

Agentes existentes (incluindo Jordana) têm o `prompt_compiled` salvo no banco. Após a mudança no template, será necessário **recompilar o prompt** desses agentes (re-salvar pelo wizard ou rodar um update). Posso incluir um pequeno script de recompilação no mesmo passo se você quiser.
