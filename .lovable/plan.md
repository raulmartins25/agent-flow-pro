

# Agendamento de Disparos + Verificação de Lote/Intervalo

## Análise do estado atual

**Lote e intervalo**: O blast-processor já usa `campaign.batch_size` e `campaign.interval_seconds` corretamente (linhas 56-57, 64, 184-187). O delay tem variação de ±20% para anti-ban. Porém há um problema: **o processor só envia 1 lote por invocação** (`.limit(batchSize)`). Se há 100 contatos e lote = 10, precisa ser chamado 10 vezes. Não há mecanismo automático de re-invocação — dependeria de cliques manuais no "Continuar".

**Agendamento**: Não existe. A campanha só inicia quando o usuário clica "Iniciar" manualmente.

## Solução

### 1. Migração — Adicionar coluna `scheduled_at` em `blast_campaigns`

```sql
ALTER TABLE blast_campaigns ADD COLUMN scheduled_at timestamptz DEFAULT NULL;
```

Quando `NULL`, disparo é imediato (comportamento atual). Quando preenchido, o cron deve iniciar no horário.

### 2. `src/pages/NewBlastPage.tsx` — Campo de agendamento

Adicionar opção "Enviar agora" vs "Agendar para":
- Radio/toggle entre imediato e agendado
- Se agendado: date picker + time picker
- Timezone fixo: America/Sao_Paulo (mostrar label "Horário de Brasília")
- Salvar `scheduled_at` como UTC no banco (converter de SP → UTC)
- Validação: não permitir data no passado

### 3. `src/pages/BlastDetailPage.tsx` — Mostrar agendamento

- Se `scheduled_at` existe e status é `pending`: mostrar badge "Agendado para DD/MM às HH:MM (Brasília)"
- Botão "Iniciar agora" permanece disponível para override manual

### 4. `supabase/functions/blast-cron/index.ts` — Nova edge function cron

Edge function que roda a cada minuto via pg_cron:
- Busca campanhas com `status = 'pending'` e `scheduled_at <= NOW()`
- Para cada uma, invoca `blast-processor` com `campaign_id`
- Isso também resolve o problema de lotes múltiplos: o cron pode re-invocar campanhas `running` que ainda têm contatos pendentes

### 5. `supabase/functions/blast-processor/index.ts` — Auto-continuação

Após processar um lote, se ainda existem contatos pendentes e status é `running`:
- O processor **se auto-invoca** novamente (fetch para si mesmo) com delay
- Isso garante que todos os lotes são processados sem intervenção manual

### 6. Cron job via pg_cron

Criar job que roda a cada minuto para verificar campanhas agendadas e campanhas running com pendentes.

## Arquivos impactados

| Arquivo | Mudança |
|---|---|
| migração SQL | Adicionar `scheduled_at` à `blast_campaigns` |
| `src/pages/NewBlastPage.tsx` | Campo de agendamento com date/time picker (timezone SP) |
| `src/pages/BlastDetailPage.tsx` | Exibir info de agendamento |
| `supabase/functions/blast-cron/index.ts` | Nova função cron para disparos agendados + continuação |
| `supabase/functions/blast-processor/index.ts` | Auto-continuação após processar lote |
| pg_cron insert | Agendar blast-cron a cada minuto |

