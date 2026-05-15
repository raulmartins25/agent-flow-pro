## Objetivo

Remover métricas duplicadas/confusas e deixar apenas as 5 que importam, cada uma com uma descrição curta explicando o que significa.

## Métricas finais (nessa ordem)

1. **Total de conversas iniciadas** — Quantos contatos diferentes iniciaram conversa no período (deduplicado por número, igual ao Inbox).
2. **Pausadas pelo Inbox** — Conversas em que um humano clicou em "Pausar" no Inbox (`paused_by = 'human'`).
3. **Pausadas pela IA** — Conversas pausadas automaticamente pelo sistema (transferência, follow-up esgotado, etc. — `paused_by = 'ai'`).
4. **Agendamentos feitos** — Total de registros em `appointments` criados no período.
5. **% Resolução da IA** — `agendamentos ÷ total de conversas iniciadas × 100`.

## Mudanças na UI (`ReportsPage.tsx`)

- Remover os cards: Atendimentos, Ativas, Em conversa, Pausadas (genérico), Transferidas, Transferências (IA).
- Manter só os 5 cards acima, em grid de 2–3 colunas.
- Adicionar `CardDescription` (texto pequeno cinza) abaixo do número com a explicação curta da métrica.
- Manter o gráfico "Evolução no período", mas com apenas 2 linhas: **Conversas iniciadas** e **Agendamentos** (remover transferências).
- Aba "Detalhado": tabela com colunas **Agente | Dispositivo | Conversas | Pausa Inbox | Pausa IA | Agendamentos | % Resolução**.
- Atualizar o CSV de exportação para refletir as mesmas colunas.

## Mudanças no hook (`useReports.ts`)

- Recalcular `attendances` deduplicando por `contact_number` por agente (mesma lógica do Inbox), para o número bater com o que o usuário vê.
- Recalcular `resolution_pct` como `appointments / attendances × 100` (sem subtrair pausas humanas).
- Remover do tipo/agg os campos não usados: `ai_transfers`, `active_count`, `replied_count`, `transferred_count` (e `paused_count` genérico).
- Manter: `attendances`, `human_paused` (Pausa Inbox), `ai_paused` (Pausa IA), `appointments`, `resolution_pct`.

## Observação ao usuário

Manter a nota: "Conversas pausadas antes do registro `paused_by` aparecem como pausadas pela IA."
