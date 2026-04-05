
# Resetar o Raul e parar as transferências repetidas

## Diagnóstico confirmado
- Seu palpite está certo: hoje o sistema está reutilizando o histórico antigo do Raul.
- No banco existem **3 conversas** do número `5562995085665`, todas já marcadas como `transferred`.
- Em `supabase/functions/evolution-webhook/index.ts`, quando não existe conversa aberta, o código pega uma conversa antiga e ainda **reativa** `transferred/closed` para `active`.
- Depois disso, `process-message` recebe o histórico completo e, como o lead já passou do total de perguntas, a regra programática dispara a transferência de novo.
- Os logs confirmam isso: o resumo foi enviado várias vezes com `status=201`. Então o problema atual não é entrega, e sim **reuso indevido da conversa finalizada**.

## O que vou implementar
1. **Reset do Raul agora**
   - Fazer um reset pontual para `5562995085665`.
   - Em vez de apagar auditoria, vou **preservar as conversas antigas** e criar uma **nova conversa limpa** para esse contato no mesmo agente/device.
   - Resultado: ele volta para o início do funil sem herdar respostas antigas.

2. **Correção permanente no webhook**
   - Ajustar `supabase/functions/evolution-webhook/index.ts` para:
     - priorizar `is_waiting_reply`
     - depois `active/paused`
     - e, se não existir conversa aberta, **criar nova conversa**
   - Remover a lógica que reabre conversa `transferred` ou `closed`.

3. **Blindagem na transferência**
   - Ajustar `supabase/functions/process-message/index.ts` para a transferência automática acontecer **só no momento em que o lead completa o funil**, e não em qualquer mensagem posterior.
   - Trocar a lógica ampla (`>=`) por uma checagem de conclusão real da última etapa.

4. **Validação**
   - Testar com o Raul após o reset:
     - o funil deve começar do zero
     - as perguntas devem seguir normalmente
     - o documento deve sair no ponto certo
     - o resumo deve ser enviado **uma única vez**

## Detalhes técnicos
- **Sem mudança de schema**.
- Haverá uma **correção de lógica** em 2 edge functions e um **reset pontual de dados** para esse contato.
- **Arquivos impactados**:
  - `supabase/functions/evolution-webhook/index.ts`
  - `supabase/functions/process-message/index.ts`
  - migração pontual para resetar o contato `5562995085665`
