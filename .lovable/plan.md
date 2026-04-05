
Objetivo: corrigir de forma definitiva os 2 problemas atuais sem mexer no que não está relacionado: agente não responde e o mesmo contato aparece duplicado no Inbox.

Diagnóstico confirmado
- O Inbox não é a causa raiz: ele está apenas exibindo dados duplicados que já estão no banco.
- Hoje o mesmo lead existe em 3 formatos diferentes:
  - `5562995085665@s.whatsapp.net`
  - `5562995085665`
  - `556295085665`
- Isso representa o mesmo número em formatos diferentes. O webhook chega em 12 dígitos, enquanto o disparo salva em 13 dígitos e/ou com sufixo.
- Além disso, no reply do lead o webhook está pegando a conversa errada: ele usa a conversa antiga em 12 dígitos em vez da conversa mais recente com `is_waiting_reply = true`.
- O agente não responde porque o `process-message` está chamando DeepSeek com `deepseek-v3`, e o log já mostra erro real: `400 Model Not Exist`.

Plano de correção

1. Padronizar telefone em um formato canônico
- Arquivos:
  - `supabase/functions/blast-processor/index.ts`
  - `supabase/functions/evolution-webhook/index.ts`
- Criar a mesma lógica de normalização nos dois fluxos:
  - remover `@s.whatsapp.net` / `@g.us`
  - remover caracteres não numéricos
  - tratar a variação BR com/sem o 9 após o DDD
- Definir um único formato interno para salvar e buscar conversas.

2. Corrigir a seleção da conversa no webhook
- Arquivo: `supabase/functions/evolution-webhook/index.ts`
- Trocar a busca atual por uma busca ranqueada, sem `.single()`.
- Regra correta:
  - procurar todas as conversas do mesmo `agent_id + device_id` que correspondam ao número canônico
  - priorizar primeiro a conversa com `is_waiting_reply = true`
  - se não houver, usar a conversa ativa/pausada mais recente
  - só criar nova conversa se realmente não existir nenhuma equivalente
- Isso corrige o caso atual em que o reply cai na conversa velha e deixa a conversa do disparo “órfã”.

3. Parar de criar conversa duplicada a cada disparo
- Arquivo: `supabase/functions/blast-processor/index.ts`
- Antes de inserir nova conversa, buscar por conversa existente do mesmo `agent_id + device_id + número canônico`.
- Se existir:
  - reutilizar a conversa
  - atualizar `contact_name` se vier melhor
  - marcar `is_waiting_reply = true`
  - atualizar `last_message_at`
- Se não existir:
  - criar normalmente
- Assim um novo disparo para o mesmo lead não gera outra linha no Inbox.

4. Corrigir a chamada da LLM para o agente voltar a responder
- Arquivo: `supabase/functions/process-message/index.ts`
- Mapear o modelo salvo `deepseek-v3` para um modelo aceito pela API atual do DeepSeek (ex.: `deepseek-chat`) antes do fetch.
- Manter o logging já adicionado.
- Resultado esperado: o `process-message` deixa de retornar `Model Not Exist` e volta a gerar resposta.

5. Limpar os dados já duplicados
- Arquivo: nova migração SQL de reparo de dados
- Fazer uma limpeza única das conversas já quebradas:
  - identificar duplicadas por `agent_id + device_id + número canônico`
  - escolher uma conversa principal
  - mover as `messages` das duplicadas para a principal
  - manter o melhor `contact_name` (ignorar `.` e vazio)
  - recalcular `last_message_at`
  - ajustar `is_waiting_reply` conforme o histórico já recebido
  - remover/arquivar as duplicadas restantes
- Isso elimina os contatos repetidos que já estão aparecendo hoje no Inbox.

O que não precisa mudar
- `InboxPage.tsx` não é a origem do bug.
- RLS não é o problema neste caso.
- Não precisa alterar o fluxo do agente receptivo.

Ordem de execução
1. Migração SQL de reparo dos dados atuais
2. `blast-processor` com reuso de conversa e número canônico
3. `evolution-webhook` com busca ranqueada priorizando `is_waiting_reply`
4. `process-message` com correção do modelo DeepSeek
5. Validação ponta a ponta

Validação final
- Fazer novo disparo para o mesmo contato.
- Confirmar que apenas 1 conversa permanece no Inbox.
- Confirmar que o reply do lead entra na mesma conversa do disparo.
- Confirmar que `is_waiting_reply` vira `false` após a resposta do lead.
- Confirmar nos logs que o `process-message` não retorna mais `Model Not Exist`.
- Confirmar que o agente responde normalmente sem afetar o agente receptivo.

Arquivos impactados
- `supabase/functions/blast-processor/index.ts`
- `supabase/functions/evolution-webhook/index.ts`
- `supabase/functions/process-message/index.ts`
- nova migração SQL de reparo de dados duplicados
