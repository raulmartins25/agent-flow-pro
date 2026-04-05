

# Correção: IA continua qualificando após transferência

## Problema
Quando a conversa já está `transferred`, o `process-message` continua enviando o prompt completo de qualificação para a IA. O `alreadyTransferred` só bloqueia a transferência duplicada, mas não muda o comportamento da IA.

## Solução

### 1. `supabase/functions/process-message/index.ts` — Early return para conversas transferidas

Logo após buscar o `convStatus` (linha ~236-241), **antes** de chamar a IA com o prompt de qualificação, interceptar e usar um prompt livre:

- Mover a query de `convStatus` para **antes** da construção do `systemPrompt` (logo após obter `config`, `device`, etc. — ~linha 115)
- Se `convStatus === 'transferred'`:
  - Montar um system prompt simplificado: "Você é [persona] da [empresa]. Esta conversa já foi encerrada e o lead foi transferido para a equipe. Responda de forma breve e cordial. NÃO faça perguntas de qualificação. NÃO emita TRANSFER_LEAD. Se perguntarem sobre próximos passos, diga que a equipe entrará em contato."
  - Chamar a IA normalmente com esse prompt + histórico recente (últimas 10 mensagens)
  - Salvar resposta e enviar via WhatsApp
  - **Return** imediatamente — sem passar pelo fluxo de transferência/mídia

### 2. `src/lib/compilePrompt.ts` — Reforço no bloco de transferência

Após a linha 159 (item 4 do bloco TRANSFERÊNCIA), adicionar:

```
APÓS EMITIR TRANSFER_LEAD:
- A conversa está ENCERRADA para fins de qualificação
- Se o lead enviar novas mensagens, responda APENAS dúvidas gerais de forma breve
- NUNCA volte ao script de perguntas
- NUNCA emita TRANSFER_LEAD novamente
- NUNCA peça informações de qualificação novamente
- Se perguntarem sobre próximos passos: "Nossa equipe já tem suas informações e entrará em contato em breve!"
```

## Arquivos impactados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/process-message/index.ts` | Early return com prompt livre para conversas transferidas |
| `src/lib/compilePrompt.ts` | Bloco pós-transferência reforçado |

