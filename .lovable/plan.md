

## Plano: Toggle para desativar followup nos agentes

### O que muda

Adicionar um **Switch** no card de Followup (WizardStep5) que habilita/desabilita o followup. Quando desativado, `followup_max` será setado para `0` e os campos ficam desabilitados visualmente.

### Implementação

**1. `src/stores/agentStore.ts`** — Adicionar campo `followup_enabled: boolean` (default `true`) ao `AgentWizardData` e ao `initialWizardData`.

**2. `src/components/wizard/WizardStep5.tsx`** — No card "Followup":
- Adicionar `Switch` no header do card ao lado do título
- Quando `followup_enabled = false`, desabilitar os 3 inputs (start, max, intervalo) com opacity reduzida
- Ao desligar o switch, setar `followup_enabled: false`; ao ligar, setar `followup_enabled: true`

**3. `src/pages/AgentWizard.tsx`** — No `handleSave`, se `followup_enabled === false`, salvar `followup_max: 0` no banco. Na carga do agente para edição, derivar `followup_enabled` de `followup_max > 0`.

**4. `followup-cron/index.ts`** — Já funciona: a condição `conv.followup_count >= followupMax` com `followupMax = 0` bloqueia qualquer followup. Nenhuma mudança necessária.

### Sem migration

Não precisa de coluna nova no banco — `followup_max = 0` já desativa o comportamento. O campo `followup_enabled` é apenas estado local do wizard.

