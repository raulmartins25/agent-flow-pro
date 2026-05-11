# Menu Relatórios

Novo item de menu **Relatórios** visível apenas para admin, com métricas por agente e dispositivo, filtros de período (dia/semana/mês/customizado) e duas abas: Visão geral (cards + gráficos) e Detalhado (tabela + export CSV).

## Métricas

Por agente/dispositivo no período selecionado:
- **Atendimentos** — total de conversas com pelo menos 1 mensagem no período
- **Transferências pela IA** — conversas com `status = 'transferred'`
- **Pausados pela IA** — `agent_paused = true` e `paused_by = 'ai'`
- **Pausados por humanos** — `agent_paused = true` e `paused_by = 'human'`
- **Agendamentos feitos** — appointments criados no período
- **% Qualidade de resolução** — heurística: `(transferidos + agendados) / (total atendimentos − pausados por humano) × 100`. Mede quantas conversas a IA conduziu até um desfecho útil sem precisar de intervenção manual.

## Mudanças no banco

1. Adicionar coluna `paused_by` na tabela `conversations`:
   - Enum `pause_origin`: `'none' | 'ai' | 'human'`, default `'none'`
2. Atualizar pontos onde `agent_paused = true` é setado:
   - `transfer-on-pause` edge function e `process-message` (gatilho de transferência) → grava `paused_by = 'ai'`
   - Inbox (botão pausar manual) → grava `paused_by = 'human'`
   - Ao despausar manualmente → volta para `'none'`

## Estrutura de arquivos

```text
src/pages/ReportsPage.tsx        — página principal com tabs e filtros
src/components/reports/
  ReportFilters.tsx              — seletor de período + agente + dispositivo
  OverviewTab.tsx                — cards de KPI + gráfico de linha (recharts)
  DetailedTab.tsx                — tabela por agente/dispositivo + botão Export CSV
src/hooks/useReports.ts          — busca agregada via supabase
src/lib/reportsExport.ts         — geração de CSV
```

Adicionar rota `/reports` em `App.tsx` e item no `AppSidebar` (filtrado: só aparece se `!isClient`). `ProtectedRoute` continua valendo; o filtro de role no sidebar já cobre o ocultamento.

## Visualização

- **Aba Visão geral**: 6 cards (1 por métrica) + gráfico de linha mostrando evolução de atendimentos/transferências/agendamentos no período
- **Aba Detalhado**: tabela com linhas por agente+dispositivo, colunas para cada métrica, botão "Exportar CSV"
- Filtros no topo: dropdown de período (Hoje / 7 dias / 30 dias / customizado), dropdown de agente (todos / específico), dropdown de dispositivo (todos / específico)

## Detalhes técnicos

- Queries client-side via `supabase` SDK com `count: 'exact', head: true` agrupadas por agente/dispositivo (múltiplas chamadas paralelas em `Promise.all`); tabelas pequenas, sem necessidade de RPC
- Gráficos: `recharts` (já no projeto via `chart.tsx`)
- CSV: gerado em memória e baixado via blob, sem dependência extra
- Migração não-destrutiva: conversas existentes ficam com `paused_by = 'none'` (relatório histórico de pausados por humano/IA começa a popular após o deploy — comunicar no topo da página)
