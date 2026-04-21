

## Aumentar limite de caracteres + editor de prompt avançado

### 1. Aumentar limite do campo "Descrição do produto/serviço"

**`src/components/wizard/WizardStep2.tsx`**
- Trocar `maxLength={500}` por `maxLength={5000}` no Textarea.
- Atualizar contador `{length}/5000`.
- Aumentar `rows` de 3 para 6 para melhor visualização.

### 2. Editor avançado de prompt no wizard

**Novo step opcional / seção avançada no `WizardStep6.tsx`** (Transferência & LLM já é o último antes de Integrações — ideal para colocar lá no final, antes de salvar).

Adicionar um bloco recolhível "⚙️ Avançado: Editar prompt manualmente" com:
- Aviso em destaque: "Recurso avançado. Editar manualmente desativa a geração automática a partir dos campos do wizard."
- Botão **"Gerar prompt a partir dos campos"** → chama `compileAgentPrompt(wizardData)` e popula o textarea.
- Textarea grande (rows=20, font-mono) com o prompt editável.
- Checkbox **"Usar prompt customizado"** — quando marcado, o sistema salva esse texto em vez de regenerar.

### 3. Persistência do prompt customizado

**`src/stores/agentStore.ts`**
- Adicionar campos: `custom_prompt_enabled: boolean` e `custom_prompt: string` em `AgentWizardData` + `initialWizardData`.

**Banco de dados** — migração:
- Adicionar colunas em `agents`:
  - `custom_prompt_enabled boolean default false`
  - `prompt_compiled` já existe — será reusado para guardar o texto final (custom ou gerado).

**`src/pages/AgentWizard.tsx`** — em `handleSave()`:
- Se `custom_prompt_enabled`: salvar `prompt_compiled = wizardData.custom_prompt` direto.
- Senão: comportamento atual (chama `compileAgentPrompt`).
- No load (edit): popular `custom_prompt` com `agent.prompt_compiled` e `custom_prompt_enabled` com a flag.

### 4. Visualização também no SimulatorPage

`SimulatorPage.tsx` já tem botão "Ver prompt" — funciona. Adicionar ali também um botão **"Editar prompt"** que abre um Dialog com textarea + Salvar (atualiza `agents.prompt_compiled` e marca `custom_prompt_enabled = true`). Permite ajustar sem reabrir o wizard.

### Validação

1. Step 2 → colar texto longo (>500 chars) → contador mostra X/5000, sem corte.
2. Step 6 → expandir "Avançado" → clicar "Gerar prompt" → ver o prompt completo no textarea.
3. Editar manualmente, marcar "Usar prompt customizado", salvar → reabrir agente → texto preservado.
4. Simulador → "Editar prompt" → ajustar → próxima mensagem usa o novo prompt.

