

# Corrigir Webhook Apontando para Projeto Errado

## Problema
O webhook da instância Evolution está apontando para um projeto Supabase antigo (`abvlrbvkctmscpnbxguy`) em vez do atual (`bcokzxaqwzsgszoltzuo`). As funções `device-connect` e `device-status` já têm lógica de auto-configuração, mas o webhook precisa ser recondigurado agora.

## Solução

### 1. Adicionar botão "Corrigir webhook" no DevicesPage.tsx
No modal de gerenciar dispositivo, quando o webhook check mostra `is_correct: false`, mostrar um botão **"Corrigir webhook"** que:
- Chama a edge function `device-connect` com o `device_id` (que já faz `setWebhook` internamente)
- Após sucesso, re-executa o check-webhook para confirmar
- Mostra toast de sucesso/erro

### 2. Redesenhar a seção de webhook no modal
Quando `webhookInfo.is_correct === false`:
- Mostrar botão "Corrigir webhook" ao lado do status
- Ao clicar, chama `device-connect` que reconfigura automaticamente
- Após correção, atualiza o status do webhook

### Arquivos

| Arquivo | Mudança |
|---|---|
| `src/pages/DevicesPage.tsx` | Botão "Corrigir webhook" quando incorreto |

