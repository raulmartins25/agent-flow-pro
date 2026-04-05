

# Redirecionamento de Contato — Prompt + Resumo de Transferência

## Mudanças

### 1. `src/lib/compilePrompt.ts`

Inserir novo bloco **REDIRECIONAMENTO DE CONTATO** logo após a seção `TRATAMENTO DE OBJEÇÕES` (após `${objectionsFormatted}`, linha ~129). O bloco instrui a IA a:

- Detectar quando o lead indica não ser o decisor (ex: "fala com o Tarik", "não sou eu", "é com meu sócio")
- Passo 1: Validar, demonstrar empatia, pedir o WhatsApp da pessoa certa
- Passo 2a: Se receber o contato → agradecer + emitir `TRANSFER_LEAD` + incluir no resumo `*Contato indicado:* [nome] — [número]`
- Passo 2b: Se recusar → tentar uma vez diferente ("Posso deixar uma mensagem com você?") → se recusar novamente, encerrar com `TRANSFER_LEAD` para notificar a equipe
- Passo 3: NUNCA continuar o fluxo de qualificação após identificar que não é o decisor

### 2. `supabase/functions/process-message/index.ts`

No bloco de montagem do `summary` (linhas ~265-299), após montar o resumo:

- Usar regex `/\d{8,15}/` na última mensagem do lead antes da transferência para capturar número indicado
- Se encontrar: adicionar `*Contato indicado pelo lead:* [número]` ao summary
- Se `answeredQuestions < totalQuestions / 2`: adicionar `*Observação:* Lead indicou que não é o decisor. Contato acima para follow-up.`

## Arquivos impactados

| Arquivo | Mudança |
|---|---|
| `src/lib/compilePrompt.ts` | Bloco de redirecionamento de contato no prompt |
| `supabase/functions/process-message/index.ts` | Detecção de contato indicado e observação no resumo |

