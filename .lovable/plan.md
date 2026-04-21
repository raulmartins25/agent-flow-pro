

## Plano: Pré-preencher rascunho do agente "Eva" (Clínica Odontológica)

### O que vou fazer

Adicionar um botão **"Carregar rascunho odontológico"** no topo do Wizard (`/agents/new`) que preenche automaticamente todos os 7 steps com a configuração da Eva odontológica que você me passou. Você só ajusta o que precisar (nome da clínica real, número de transferência, dispositivo, clínica/especialidade Ecuro) e salva.

### Conteúdo pré-preenchido

**Step 1** — Tipo: Receptivo, Nome: `Eva - Clínica Odontológica` (você troca pelo nome real). Dispositivo: vazio (você seleciona).

**Step 2** — Persona: `Eva`, Empresa: `[Nome da Clínica]` (você edita), Segmento: `Odontologia`, Tom: Semi-formal, Descrição: especialidades completas (implante protocolo/zigomático, ortodontia, estética, odontopediatria, avaliação gratuita com exame, anestesia geral), Restrições: bloco completo de regras de comportamento que você passou (fluxo, agendamento via Ecuro, recusa, cancelamento, valores, descontos, planos, aposentados, odontopediatria, acompanhante, identidade, anti-duplicação).

**Step 3** — Mensagem de boas-vindas pronta com `{{nome_contato}}`.

**Step 4** — 4 perguntas de qualificação (procura/tempo/dor/impacto social), sem mídia.

**Step 5** — 4 objeções pré-configuradas ("tá caro", "quero saber preço antes", "não posso ir agora", "quero cancelar"). Followup: ativo, msg 3, máx 3, intervalo 120min. Anti-ban padrão.

**Step 6** — Trigger: `after_all_questions`. Template de resumo com nome/telefone/respostas. LLM: Claude Sonnet (Lovable AI Gateway).

**Step 7** — Ecuro: ativado, ambiente Dev. Clínica e especialidade em branco (você seleciona após carregar).

### Como funciona

- Botão aparece **apenas em `/agents/new`** (não em edição), no topo do wizard
- Texto: "Carregar rascunho: Clínica Odontológica"
- Ao clicar: preenche `wizardData` via `updateWizardData()` e mostra toast "Rascunho carregado — revise e ajuste"
- Você navega pelos steps, ajusta o que precisar, e clica "Criar agente" no final

### Arquivos modificados

- `src/lib/draftTemplates.ts` (novo) — exporta `dentalClinicDraft: Partial<AgentWizardData>` com toda a configuração
- `src/pages/AgentWizard.tsx` — adiciona botão de carregar rascunho (só visível em modo criação)

### Após aprovação

Implemento, você abre `/agents/new`, clica no botão, ajusta nome da clínica + dispositivo + clínica/especialidade Ecuro no Step 7, e salva. Pronto.

