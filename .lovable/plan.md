

# Correção: IA repete perguntas + não transfere

## Arquivos impactados
- `src/lib/compilePrompt.ts` — prompt com controle de progresso e token TRANSFER_LEAD
- `supabase/functions/process-message/index.ts` — detectar TRANSFER_LEAD e enviar resumo

---

## 1. compilePrompt.ts — Controle de progresso

Adicionar bloco antes da lista de perguntas (tanto receptivo quanto prospecção):

```
CONTROLE DE PROGRESSO — OBRIGATÓRIO:
Antes de fazer qualquer pergunta, verifique o histórico da conversa.
Se a pergunta JÁ FOI FEITA e o lead JÁ RESPONDEU, marque como concluída e passe para a próxima não respondida.
NUNCA repita uma pergunta que já foi respondida, mesmo após tratar uma objeção.
Após resolver uma objeção, retome EXATAMENTE de onde parou — na próxima pergunta ainda não respondida.
Ao receber cada resposta, internamente registre: "Pergunta N: RESPONDIDA".
Sempre que for fazer uma pergunta, confirme que ela ainda não foi respondida.
```

## 2. compilePrompt.ts — Bloco de transferência

Substituir o bloco "ENCERRAMENTO E TRANSFERÊNCIA" (linhas 123-125) por:

```
TRANSFERÊNCIA — PRIORIDADE MÁXIMA:
Quando {trigger_text}, você DEVE:
1. Enviar uma mensagem de encerramento calorosa e breve ao lead
2. Incluir OBRIGATORIAMENTE na sua resposta o token exato: TRANSFER_LEAD
3. PARAR completamente — não fazer mais nenhuma pergunta após emitir TRANSFER_LEAD
4. Se o lead continuar respondendo após a transferência, responda apenas:
   "Nossa equipe já tem suas informações e entrará em contato em breve!"

IMPORTANTE: TRANSFER_LEAD deve aparecer em toda resposta de encerramento, sem exceção.
```

## 3. process-message/index.ts — Detectar TRANSFER_LEAD

Após gerar `aiResponse` e antes do bloco SEND_MEDIA (linha ~149):

1. Checar `aiResponse.includes('TRANSFER_LEAD')`
2. Remover token do texto visível: `cleanResponse = aiResponse.replace(/TRANSFER_LEAD/g, '').trim()`
3. Se `shouldTransfer`:
   - Montar resumo com nome do contato, telefone, data, agente, e pares pergunta/resposta do histórico
   - Enviar resumo para `agentFull.transfer_number` via Evolution API
   - Atualizar conversa para `status: 'transferred'`
   - Logar `Lead transferido para: {number}`
4. Remover o bloco antigo de TRANSFER CHECK (linhas 212-241) — substituído pela detecção via token

---

## Fluxo resultante
1. IA recebe histórico → verifica quais perguntas já foram respondidas → faz só a próxima
2. Quando todas respondidas → IA envia despedida + TRANSFER_LEAD
3. process-message detecta token → envia resumo → marca conversa como transferred
4. Se lead manda mais msgs após transferência → IA responde apenas "equipe entrará em contato"

