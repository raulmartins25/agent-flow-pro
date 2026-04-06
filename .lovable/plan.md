
# Fazer a conversa encerrar de forma determinística quando o lead demonstra desinteresse

## Diagnóstico confirmado

Sim, agora dá para cravar o problema.

O sistema hoje depende demais do modelo emitir `END_CONVERSATION`. Isso está falhando em alguns casos de desinteresse educado, como o seu print:

- lead: “Não obrigado !”
- IA responde educadamente
- mas a conversa continua `active`
- depois o `followup-cron` volta a mandar mensagem

Conferi o fluxo atual e há **dois furos principais**:

1. **`process-message` só fecha automaticamente em casos muito estreitos**
   - existe um bloco “ban trigger” com match exato/início de frase
   - ele cobre palavras como `para`, `stop`, `não quero`
   - **não cobre bem frases como “não obrigado”, “obrigado, mas não”, “sem interesse aqui”, etc.**
   - depois disso o código volta a depender do LLM emitir `END_CONVERSATION`

2. **`followup-cron` até tenta bloquear desinteresse, mas a lista está incompleta**
   - hoje ele não inclui `não obrigado` / `nao obrigado`
   - então uma conversa pode continuar ativa e receber follow-up indevido

Também validei no banco um caso real recente:
- existe mensagem do lead `Não obrigado !`
- a conversa correspondente ainda aparece como `status: active`
- isso confirma que o encerramento não está sendo aplicado de forma confiável no backend

## O que vou ajustar

### 1) `supabase/functions/process-message/index.ts`
Adicionar uma **detecção programática de desinteresse**, antes da chamada ao modelo.

Em vez de depender só do prompt/LLM:
- ler a última mensagem do usuário
- normalizar texto
- detectar frases de desinteresse com match por inclusão
- se detectar:
  - enviar uma resposta curta de encerramento
  - atualizar a conversa para:
    - `status: "closed"`
    - `agent_paused: true`
    - `is_waiting_reply: false`
  - retornar imediatamente
  - não chamar LLM
  - não enviar mídia
  - não transferir
  - não permitir nova resposta automática

Exemplos que a regra deve cobrir:
- `não obrigado`
- `nao obrigado`
- `não tenho interesse`
- `sem interesse`
- `não quero`
- `não me interessa`
- `obrigado mas não`
- `obrigada mas não`
- `não preciso`
- `não quero receber`
- `não precisa`
- `sem interesse aqui`

### 2) `supabase/functions/followup-cron/index.ts`
Fortalecer a trava de segurança.

Hoje já existe um bloco parecido, mas vou alinhar a mesma lista de desinteresse usada no `process-message` e, ao detectar:
- fechar a conversa com:
  - `status: "closed"`
  - `agent_paused: true`
  - `is_waiting_reply: false`
- impedir qualquer follow-up futuro

Assim o cron vira uma segunda barreira, caso alguma conversa antiga tenha escapado.

### 3) Não depender da recompilação do prompt para resolver isso
A correção principal será **backend programático**, não só no prompt.

Isso é importante porque:
- agentes antigos podem ter `prompt_compiled` desatualizado
- mesmo com prompt correto, o LLM ainda pode variar
- a regra de “lead sem interesse = encerrar” precisa ser rígida, não probabilística

## Resultado esperado

Depois dessa correção, quando o lead responder algo como “Não obrigado”:
- a IA envia apenas a mensagem final de encerramento
- a conversa é fechada imediatamente
- o agente fica pausado para aquela conversa
- nenhum follow-up automático volta a ser enviado

## Arquivos impactados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/process-message/index.ts` | Encerramento determinístico por desinteresse antes do LLM |
| `supabase/functions/followup-cron/index.ts` | Trava de segurança para nunca fazer follow-up em leads desinteressados |

## Detalhe técnico
Vou centralizar a lógica em uma verificação simples de texto normalizado no backend, para não depender de:
- token `END_CONVERSATION`
- prompt recompilado
- interpretação variável do modelo

Isso resolve exatamente o caso do print.
