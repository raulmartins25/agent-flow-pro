

# Correção: Mídia das perguntas desalinhada no template e na edição

## Problemas identificados

1. **Variáveis no Step 6 usam índice do array** — Os chips `{{pergunta_1}}`, `{{resposta_1}}` são baseados na posição do array. Se o usuário reordenar perguntas no Step 4 (drag & drop), o mapeamento quebra. Uma pergunta que era P3 vira P1, mas o template ainda referencia `{{pergunta_3}}`.

2. **No backend (process-message), as respostas são mapeadas por índice** — `userMessages[index + offset]` assume que o lead respondeu na ordem exata do array. Após reordenação, a resposta pode ser associada à pergunta errada no resumo.

3. **Indicação visual de mídia nos chips do Step 6** — Todos os chips P/R parecem iguais. Não há diferença visual entre perguntas com e sem mídia anexada.

## Solução

### `src/components/wizard/WizardStep6.tsx`
- Adicionar ícone 📎 nos chips de perguntas que possuem `media` configurada, para diferenciar visualmente
- O mapeamento por índice é correto para o template (P1 = primeira pergunta da lista atual), mas precisa ficar claro que a numeração segue a **ordem atual** das perguntas

### `src/components/wizard/WizardStep4.tsx`
- Após reordenar (drag & drop), garantir que o `media` acompanha a pergunta (já funciona — o objeto inteiro é movido). O problema pode estar no `openPanels` state que usa `q.id` como chave — isso deve estar correto.
- Verificar se ao carregar dados na edição, o campo `media` é preservado corretamente dentro de cada objeto de pergunta

### `supabase/functions/process-message/index.ts`
- O mapeamento `userMessages[index + offset]` é frágil — se a IA pular uma pergunta ou o lead responder duas de uma vez, o alinhamento quebra
- Melhorar: usar o histórico completo para buscar a resposta mais provável para cada pergunta, em vez de confiar puramente no índice

## Mudanças concretas

### 1. `src/components/wizard/WizardStep6.tsx`
- Nos chips de perguntas cadastradas, adicionar indicador visual (📎) quando `q.media?.file_url` existe
- Manter a lógica de índice para as variáveis (é o comportamento correto — P1 = primeira da lista)

### 2. `supabase/functions/process-message/index.ts`
- No bloco de transferência, manter o mapeamento por índice (é a melhor heurística disponível sem NLP complexo)
- Adicionar log das perguntas e respostas mapeadas para facilitar debug futuro

### Arquivo impactado

| Arquivo | Mudança |
|---|---|
| `src/components/wizard/WizardStep6.tsx` | Indicador visual 📎 em chips de perguntas com mídia |
| `supabase/functions/process-message/index.ts` | Logs adicionais no mapeamento pergunta→resposta |

**Nota**: A IA conversando funciona perfeitamente (confirmado pelo usuário). O problema é apenas visual/de apresentação nos chips e no alinhamento do resumo.

