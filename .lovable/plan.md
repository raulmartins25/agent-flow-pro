

# Correção: Transferência e Mídia Não Executam

## Diagnóstico

Os logs mostram claramente:
- **Transfer**: `shouldTransfer=false` em TODAS as interações. A IA (DeepSeek) responde "Vou passar suas informações para nossa equipe..." mas **nunca inclui o token `TRANSFER_LEAD`** na resposta.
- **Mídia**: A IA nunca inclui `SEND_MEDIA:xxx` — o PDF configurado na pergunta 3 nunca é enviado.

**Causa raiz**: O DeepSeek ignora as instruções de incluir tokens especiais (`TRANSFER_LEAD`, `SEND_MEDIA:xxx`). Depender da IA para incluir tokens é frágil e pouco confiável.

## Solução: Detecção Programática

Em vez de depender do LLM incluir tokens, o backend vai **detectar automaticamente** quando transferir e quando enviar mídia.

### `supabase/functions/process-message/index.ts`

**1. Auto-detect transferência**

Após receber a resposta da IA, contar quantas perguntas de qualificação foram respondidas pelo lead (mensagens com `role=user`). Se o `transfer_trigger=after_all_questions` e o número de respostas do lead >= número de perguntas, forçar a transferência mesmo sem o token `TRANSFER_LEAD`:

```
const totalQuestions = questions.length;
const userMsgCount = history.filter(m => m.role === 'user').length;
const offset = agent.type === 'prospecting' ? 1 : 0;
const answeredQuestions = userMsgCount - offset;

if (!shouldTransfer && transfer_trigger === 'after_all_questions' 
    && answeredQuestions >= totalQuestions && transfer_number) {
  shouldTransfer = true; // force transfer
}
```

**2. Auto-detect envio de mídia**

Após cada resposta da IA, verificar qual pergunta está sendo feita/respondida no fluxo. Se a pergunta atual tem mídia configurada e a condição é `always`, ou se o lead respondeu positivamente (`positive_response`/`explicit_yes`), enviar a mídia programaticamente sem depender do token `SEND_MEDIA`:

- Mapear a posição atual na conversa (quantas perguntas já foram respondidas)
- Verificar se a pergunta correspondente tem mídia configurada
- Se `send_condition=always`: enviar imediatamente
- Se `send_condition=positive_response`: analisar se a última resposta do lead é positiva (usar heurística simples: não contém palavras negativas)
- Manter compatibilidade: se o token `SEND_MEDIA:xxx` estiver na resposta da IA, usar o fluxo existente

**3. Manter token como fallback**

O sistema existente de tokens continua funcionando. A detecção programática é um complemento, não substituição.

## Arquivo impactado

| Arquivo | Mudança |
|---|---|
| `supabase/functions/process-message/index.ts` | Detecção programática de transferência + envio automático de mídia |

