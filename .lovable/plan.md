

# Correção: Mídia na transferência + IA pós-transferência

## Bug 1 — SEND_MEDIA ignorado quando há TRANSFER_LEAD

**Problema**: Nas linhas 457-501, o processamento de `SEND_MEDIA` acontece DEPOIS da transferência, sem verificar se `shouldTransfer` é true. A IA às vezes inclui `SEND_MEDIA` na mesma resposta de transferência.

**Correção**: Mover a lógica de SEND_MEDIA (linhas 457-501) e a detecção programática de mídia (linhas 503-578) para dentro de um bloco `if (!shouldTransfer)`. O `cleanResponse` continua removendo os tokens de qualquer forma.

```typescript
// Limpar tokens do texto SEMPRE
cleanResponse = cleanResponse.replace(/SEND_MEDIA:[a-f0-9-]+/gi, "").replace(/\s{2,}/g, " ").trim();

// Processar envio de mídia APENAS se NÃO for transferência
if (!shouldTransfer) {
  // lógica de SEND_MEDIA tokens e detecção programática
}
```

## Bug 2 — IA continua respondendo após transferência

**Problema**: O early return para `transferred` existe (linhas 119-191) e funciona. Porém, olhando a imagem, a mensagem "Entendo! É com você que eu falo sobre o espaço físico da clínica?" foi enviada ANTES da conversa ser marcada como transferred — ela é parte da mesma resposta LLM que contém TRANSFER_LEAD.

**Causa real**: A IA gera texto + TRANSFER_LEAD na mesma resposta. O texto da IA é enviado ao lead (linha 587-591) E a transferência acontece. O problema é que o `cleanResponse` contém esse texto "extra" de qualificação.

**Correção**: Quando `shouldTransfer` é true, substituir o `cleanResponse` por uma mensagem fixa de encerramento, ignorando o que a IA escreveu:

```typescript
if (shouldTransfer && agentFull?.transfer_number) {
  // Substituir resposta da IA por mensagem de encerramento padronizada
  cleanResponse = "Perfeito! Vou passar suas informações para nossa equipe, que entrará em contato em breve. Obrigado pelo seu tempo!";
  // ... resto da lógica de transferência
}
```

## Arquivo impactado

| Arquivo | Mudança |
|---|---|
| `supabase/functions/process-message/index.ts` | Bloquear SEND_MEDIA quando shouldTransfer; substituir resposta por msg fixa na transferência |

