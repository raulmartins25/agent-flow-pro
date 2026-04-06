
# Fazer a blacklist realmente parar toda a automação

## Diagnóstico confirmado
Do I know what the issue is? Sim.

- A mensagem do print (“Oi! Só passando para verificar se tem alguma dúvida...”) vem do `followup-cron`, não do modelo.
- Conferi o código e o estado atual: o número já está na blacklist do dispositivo correto, mas a conversa continuou `active` e recebeu follow-up depois disso.
- Hoje a blacklist barra só parte do fluxo:
  - `evolution-webhook`
  - `blast-processor`
- Ela ainda **não barra**:
  - `followup-cron`
  - `process-message`
- Além disso, o branch de blacklist no `evolution-webhook` tem um bug de runtime: ele usa `normalizedPhone`, variável que não existe.

## O que vou corrigir

### 1) `supabase/functions/followup-cron/index.ts`
Adicionar a checagem de blacklist antes de qualquer regra de follow-up.

Se o número da conversa estiver na blacklist do mesmo usuário + mesmo dispositivo:
- não enviar follow-up
- atualizar a conversa para:
  - `status: "closed"`
  - `agent_paused: true`
  - `is_waiting_reply: false`
- seguir para a próxima conversa

Isso resolve exatamente o caso do print.

### 2) `supabase/functions/process-message/index.ts`
Adicionar uma guarda global de blacklist no início da função.

Se o contato estiver bloqueado:
- encerrar/pausar a conversa
- retornar imediatamente
- não chamar LLM
- não enviar texto
- não enviar mídia
- não enviar transferência
- não gravar nova mensagem do assistant

Também vou repetir essa verificação imediatamente antes dos envios externos, para cobrir race condition caso o número entre na blacklist enquanto a função já está rodando.

### 3) `supabase/functions/evolution-webhook/index.ts`
Corrigir o branch atual da blacklist:
- trocar o log para usar a variável certa (`canonicalRemote`)
- ao detectar blacklist, fechar/pausar eventual conversa aberta daquele número/dispositivo antes de retornar `200`

## Resultado esperado
Depois disso, número na blacklist não receberá mais:
- resposta da IA
- follow-up automático
- disparo futuro

E se já existir uma conversa aberta com esse número, ela será encerrada assim que qualquer fluxo backend tocar nela.

## Arquivos impactados
| Arquivo | Mudança |
|---|---|
| `supabase/functions/followup-cron/index.ts` | Bloquear follow-up para números em blacklist e encerrar conversa |
| `supabase/functions/process-message/index.ts` | Guard global de blacklist antes de qualquer resposta/envio |
| `supabase/functions/evolution-webhook/index.ts` | Corrigir branch da blacklist e encerrar conversa aberta |

## Detalhes técnicos
- Não precisa migration.
- Não precisa mudar frontend.
- Vou usar a mesma normalização canônica de telefone nos 3 pontos para evitar erro entre JID / 12 dígitos / 13 dígitos.
- A regra sempre será: `user_id` + `device_id` + telefone canonicalizado.
