import jsPDF from 'jspdf';

interface PdfMeta {
  periodLabel: string;
  agentLabel: string;
  deviceLabel: string;
}

interface PdfTotals {
  attendances: number;
  paused: number;
  ai_transfers: number;
  appointments: number;
  resolution_pct: number;
}

export function exportOverviewPDF(totals: PdfTotals, meta: PdfMeta) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  const now = new Date();
  const stamp = now.toLocaleString('pt-BR');

  // ===== Header =====
  pdf.setFillColor(37, 211, 102); // WhatsApp green
  pdf.rect(0, 0, pageW, 22, 'F');
  pdf.setTextColor(255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text('Relatório — Visão Geral', margin, 14);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`Gerado em ${stamp}`, pageW - margin, 14, { align: 'right' });

  y = 30;
  pdf.setTextColor(0);

  // ===== Filtros =====
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text('Filtros aplicados', margin, y);
  y += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(70);
  pdf.text(`Período: ${meta.periodLabel}`, margin, y); y += 5;
  pdf.text(`Agente: ${meta.agentLabel}`, margin, y); y += 5;
  pdf.text(`Dispositivo: ${meta.deviceLabel}`, margin, y); y += 8;
  pdf.setTextColor(0);

  // ===== Indicadores (KPIs) =====
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('Indicadores', margin, y);
  y += 6;

  const kpis: { title: string; value: string; desc: string }[] = [
    {
      title: 'Total de conversas iniciadas',
      value: String(totals.attendances),
      desc: 'Contatos únicos que iniciaram conversa no período (mesma contagem do Inbox).',
    },
    {
      title: 'Pausadas (Inbox)',
      value: String(totals.paused),
      desc: 'Conversas pausadas — todas que aparecem em amarelo no Inbox (humano assumiu ou foi pausada após transferência).',
    },
    {
      title: 'Transferidas pela IA',
      value: String(totals.ai_transfers),
      desc: 'Conversas que a IA transferiu para um humano — todas que aparecem em azul no Inbox (status transferido).',
    },
    {
      title: 'Agendamentos feitos',
      value: String(totals.appointments),
      desc: 'Total de agendamentos confirmados/criados pelo agente no período.',
    },
    {
      title: '% Resolução da IA',
      value: `${totals.resolution_pct}%`,
      desc: '(Agendamentos + transferências feitas pela IA) ÷ total de conversas iniciadas. Mede quantos atendimentos a IA conseguiu resolver ou encaminhar.',
    },
  ];

  const cardW = (contentW - 6) / 2;
  const cardH = 28;
  let col = 0;
  let rowY = y;
  for (const k of kpis) {
    const x = margin + col * (cardW + 6);
    if (rowY + cardH > pageH - margin) {
      pdf.addPage();
      rowY = margin;
    }
    pdf.setDrawColor(220);
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(x, rowY, cardW, cardH, 2, 2, 'FD');

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(110);
    pdf.text(k.title, x + 4, rowY + 5);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.setTextColor(0);
    pdf.text(k.value, x + 4, rowY + 14);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(90);
    const desc = pdf.splitTextToSize(k.desc, cardW - 8);
    pdf.text(desc, x + 4, rowY + 19);

    col++;
    if (col === 2) { col = 0; rowY += cardH + 4; }
  }
  y = rowY + (col === 0 ? 0 : cardH) + 8;
  pdf.setTextColor(0);

  // ===== Explicação =====
  if (y + 60 > pageH - margin) { pdf.addPage(); y = margin; }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('Por que as métricas não somam exatamente o total de conversas?', margin, y);
  y += 6;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  const intro = pdf.splitTextToSize(
    'As métricas não são mutuamente exclusivas e usam regras de contagem diferentes:',
    contentW,
  );
  pdf.text(intro, margin, y);
  y += intro.length * 5 + 2;

  const bullets = [
    'Conversas iniciadas conta contatos únicos — se o mesmo número abriu 2 conversas, soma 1.',
    'Pausadas e Transferidas IA contam cada conversa individualmente, sem deduplicar por contato.',
    'Uma mesma conversa pode estar pausada e transferida ao mesmo tempo — entra nas duas categorias.',
    'Agendamentos são uma entidade separada — uma conversa pode gerar mais de um agendamento.',
  ];
  for (const b of bullets) {
    const lines = pdf.splitTextToSize(b, contentW - 6);
    if (y + lines.length * 5 > pageH - margin) { pdf.addPage(); y = margin; }
    pdf.text('•', margin, y);
    pdf.text(lines, margin + 5, y);
    y += lines.length * 5 + 1;
  }

  y += 3;
  const closing = pdf.splitTextToSize(
    'Por isso somar Pausadas + Transferidas + Agendamentos pode ultrapassar o Total de conversas. A % Resolução da IA assume essa sobreposição como proxy de eficácia.',
    contentW,
  );
  if (y + closing.length * 5 > pageH - margin) { pdf.addPage(); y = margin; }
  pdf.text(closing, margin, y);
  y += closing.length * 5 + 6;

  // Observação
  if (y + 20 > pageH - margin) { pdf.addPage(); y = margin; }
  pdf.setDrawColor(220);
  pdf.line(margin, y, pageW - margin, y);
  y += 5;
  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(9);
  pdf.setTextColor(90);
  const obs = pdf.splitTextToSize(
    'Obs.: a distinção "pausado por humano vs IA" começou a ser registrada em 11/05/2026 — conversas pausadas antes dessa data aparecem como pausadas pela IA.',
    contentW,
  );
  pdf.text(obs, margin, y);

  // Footer com numeração de páginas
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(140);
    pdf.text(`Página ${i} de ${pageCount}`, pageW - margin, pageH - 8, { align: 'right' });
    pdf.text('AgentFlow — Relatórios', margin, pageH - 8);
  }

  const fname = `relatorio-visao-geral-${now.toISOString().slice(0, 10)}.pdf`;
  pdf.save(fname);
}
