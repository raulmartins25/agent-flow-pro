## Relatório Avançado da Jordana — análise por IA

Objetivo: gerar um PDF executivo para você apresentar ao cliente (advogado), mostrando desempenho real da Jordana, com números, exemplos de conversas e recomendações de melhoria — material persuasivo para ele continuar com o serviço.

### Escopo dos dados (já levantado)
- Período: 05/05/2026 → 09/06/2026
- 301 conversas, 299 contatos únicos
- 83 transferidas pela IA, 81 pausadas
- 58 agendamentos confirmados
- Taxa de resolução (agend. + transf.) ≈ 47%

### Estrutura do PDF (8–10 páginas, marca 2M Digital)

1. **Capa** — logo 2M Digital, nome do cliente, período analisado, "Relatório de Desempenho — Agente Jordana".
2. **Resumo executivo (1 página)** — 4–5 bullets de alto nível: volume atendido, % resolvida, agendamentos gerados, tempo economizado estimado, ROI percebido.
3. **KPIs principais** — cards visuais: conversas, contatos únicos, agendamentos, transferências, taxa de resolução, tempo médio de resposta, horário de pico.
4. **Análise qualitativa por IA** (núcleo do relatório) — usando Lovable AI (Gemini) sobre uma amostra estratificada das conversas:
   - O que a IA está acertando (tom, qualificação, agendamento)
   - Onde está perdendo o lead (objeções não tratadas, dúvidas recorrentes, momentos de fricção)
   - Padrões de objeções mais comuns (top 5)
   - Perguntas frequentes que poderiam virar resposta automática
5. **Funil de atendimento** — gráfico: contatos → qualificados → agendados → transferidos → perdidos.
6. **Trechos reais anonimizados** — 3–4 exemplos de conversas bem resolvidas e 2 que precisariam ajuste (nomes mascarados).
7. **Recomendações práticas** — lista priorizada (alto/médio/baixo impacto) com ação concreta para cada ponto fraco.
8. **Próximos passos / proposta de continuidade** — sugestão de evolução (treinar IA com novos padrões, adicionar follow-up X, expandir para Y).

### Como será gerado (técnico)

- Novo edge function `jordana-report` que:
  1. Lê todas as conversas + mensagens da Jordana no período.
  2. Calcula KPIs agregados (SQL).
  3. Faz amostragem estratificada (~40 conversas: 15 agendadas, 10 transferidas, 10 perdidas/abandonadas, 5 longas).
  4. Chama Lovable AI (`google/gemini-2.5-pro`) com prompt estruturado pedindo JSON com: pontos fortes, fraquezas, top objeções, FAQs, exemplos comentados, recomendações.
  5. Retorna JSON consolidado.
- Frontend: nova rota `/relatorio-avancado/jordana` (ou botão "Gerar relatório avançado" em Relatórios) que chama a function e renderiza o PDF via `jsPDF` reusando o estilo de marca já existente em `src/lib/reportsPdf.ts` (cores 2M Digital, header com logo, footer com gradiente).
- Anonimização: nomes/telefones mascarados nos trechos citados (primeiro nome + iniciais, telefone `(11) ****-1234`).
- Salva PDF localmente no navegador (download) — sem armazenar no Storage.

### Custo / tempo
- 1 geração ≈ 1 chamada Gemini Pro com ~50k tokens entrada / ~5k saída.
- Tempo de geração: 30–60s (loading state no botão).

### Fora do escopo
- Não cria página recorrente automática.
- Não envia por e-mail.
- Não altera dados de conversas/agentes.

Se aprovar, parto para implementação.
