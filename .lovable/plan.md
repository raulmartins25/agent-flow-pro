

## Correção: Coluna `evolution_message_id` ausente na tabela `messages`

### Problema
O webhook `evolution-webhook` tenta inserir mensagens com o campo `evolution_message_id` para garantir idempotência (evitar mensagens duplicadas). Porém, essa coluna **não existe** na tabela `messages`. O insert falha, a mensagem do usuário não é salva, mas o fluxo continua chamando `process-message`. A IA gera respostas sem o contexto das mensagens do lead, "conversando sozinha".

### Correção (1 migration)

**Migration SQL:**
```sql
ALTER TABLE public.messages
ADD COLUMN evolution_message_id text;

CREATE UNIQUE INDEX idx_messages_evolution_id
ON public.messages (evolution_message_id)
WHERE evolution_message_id IS NOT NULL;
```

Isso:
1. Adiciona a coluna que o webhook já espera
2. Cria um índice único parcial para que mensagens duplicadas (mesmo `evolution_message_id`) sejam rejeitadas com erro 23505, ativando a lógica de idempotência que já existe no código

### Sem mudança de código
O webhook já está correto — o problema é apenas a coluna ausente no banco.

