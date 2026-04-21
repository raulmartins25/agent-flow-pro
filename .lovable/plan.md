

## Corrigir simulador para usar DeepSeek

### Causa real

O simulador está chamando DeepSeek com o modelo `deepseek-v3`, que **não existe**. O modelo correto da DeepSeek é `deepseek-chat` (V3) ou `deepseek-reasoner` (R1). A API retorna erro, e como o código faz `data.choices?.[0]?.message?.content || ""`, mascara como string vazia → toast genérico "não consegui processar".

### Mudanças

**`supabase/functions/simulate-chat/index.ts`**
- Manter respeito ao `llm_provider` do agente (DeepSeek/OpenAI/Lovable).
- Para DeepSeek: se `llm_model` for inválido/vazio, fazer fallback para `deepseek-chat`. Aceitar variações comuns (`deepseek-v3` → `deepseek-chat`, `deepseek-r1` → `deepseek-reasoner`).
- Tratar erro de forma explícita: se a API retornar não-2xx ou sem `content`, devolver HTTP 500 com `error` contendo status + corpo da resposta (não mais string vazia silenciosa).
- Adicionar logs (`console.log`) com provider, model, status, e snippet do erro para debug futuro.
- Mesmo tratamento melhorado para OpenAI (fallback de modelo + erro explícito).

**`src/pages/SimulatorPage.tsx` e `src/pages/PublicSimulatorPage.tsx`**
- Quando `invoke` retornar `error` ou `data.error`, mostrar a mensagem real via toast em vez de inserir "Desculpe, não consegui processar...".

**`src/components/wizard/WizardStep6.tsx`** (correção de origem)
- Atualizar as opções de modelo DeepSeek no seletor para os nomes válidos (`deepseek-chat`, `deepseek-reasoner`) — assim novos agentes não nascem com `deepseek-v3` quebrado.

### Validação

1. Abrir `/agents/9d01e0ff…/simulator` → enviar mensagem → deve receber resposta da Jordana via DeepSeek.
2. Se a chave estiver errada, o toast mostrará o erro real da DeepSeek (ex: "Invalid API key") em vez de mascarar.
3. Editar o agente → Step 6 → o seletor mostrará `deepseek-chat` / `deepseek-reasoner` (não mais `deepseek-v3`).

### Observação sobre o agente atual

O agente "Jordana" está salvo com `llm_model = "deepseek-v3"`. O fallback no edge function vai traduzir isso para `deepseek-chat` automaticamente, então funcionará sem você precisar reeditar. Mas recomendo abrir o agente uma vez e re-salvar para gravar o modelo correto.

