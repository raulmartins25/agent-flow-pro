import jsPDF from 'jspdf';
import logoUrl from '@/assets/2m-digital-logo.png';

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

// 2M Digital brand colors (extraídas do logo)
const BRAND = {
  blue: [37, 99, 235] as [number, number, number],       // #2563EB
  purple: [124, 58, 237] as [number, number, number],    // #7C3AED
  dark: [45, 45, 55] as [number, number, number],        // texto "DIGITAL"
  textMuted: [110, 116, 130] as [number, number, number],
  cardBg: [248, 249, 252] as [number, number, number],
  cardBorder: [225, 228, 235] as [number, number, number],
};

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportOverviewPDF(totals: PdfTotals, meta: PdfMeta) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  const now = new Date();
  const stamp = now.toLocaleString('pt-BR');

  const logoData = await loadLogoDataUrl();

  // ===== Header com identidade 2M Digital =====
  // Faixa superior fina degradê (simulada com 2 retângulos)
  pdf.setFillColor(...BRAND.blue);
  pdf.rect(0, 0, pageW / 2, 3, 'F');
  pdf.setFillColor(...BRAND.purple);
  pdf.rect(pageW / 2, 0, pageW / 2, 3, 'F');

  // Bloco de cabeçalho branco com logo
  const headerH = 28;
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 3, pageW, headerH, 'F');

  if (logoData) {
    // logo proporcional: ~38mm de largura, altura proporcional
    try {
      pdf.addImage(logoData, 'PNG', margin, 7, 38, 12);
    } catch { /* ignore */ }
  }

  // Título e timestamp à direita
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(...BRAND.dark);
  pdf.text('Relatório — Visão Geral', pageW - margin, 13, { align: 'right' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(...BRAND.textMuted);
  pdf.text(`Gerado em ${stamp}`, pageW - margin, 19, { align: 'right' });

  // Linha separadora gradiente
  pdf.setFillColor(...BRAND.blue);
  pdf.rect(0, 3 + headerH, pageW / 2, 1, 'F');
  pdf.setFillColor(...BRAND.purple);
  pdf.rect(pageW / 2, 3 + headerH, pageW / 2, 1, 'F');

  y = 3 + headerH + 8;
  pdf.setTextColor(0);

  // ===== Filtros =====
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(...BRAND.dark);
  pdf.text('Filtros aplicados', margin, y);
  y += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(...BRAND.textMuted);
  pdf.text(`Período: ${meta.periodLabel}`, margin, y); y += 5;
  pdf.text(`Agente: ${meta.agentLabel}`, margin, y); y += 5;
  pdf.text(`Dispositivo: ${meta.deviceLabel}`, margin, y); y += 8;

  // ===== Indicadores (KPIs) =====
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.setTextColor(...BRAND.dark);
  pdf.text('Indicadores', margin, y);
  // pequeno acento roxo ao lado do título
  pdf.setFillColor(...BRAND.purple);
  pdf.rect(margin - 3, y - 3.5, 1.2, 4, 'F');
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
  const cardH = 30;
  let col = 0;
  let rowY = y;
  for (const k of kpis) {
    const x = margin + col * (cardW + 6);
    if (rowY + cardH > pageH - margin) {
      pdf.addPage();
      rowY = margin;
    }
    // borda + fundo do card
    pdf.setDrawColor(...BRAND.cardBorder);
    pdf.setFillColor(...BRAND.cardBg);
    pdf.roundedRect(x, rowY, cardW, cardH, 2.5, 2.5, 'FD');

    // barra lateral colorida (gradiente azul→roxo simulado em 2 partes)
    pdf.setFillColor(...BRAND.blue);
    pdf.rect(x, rowY, 1.5, cardH / 2, 'F');
    pdf.setFillColor(...BRAND.purple);
    pdf.rect(x, rowY + cardH / 2, 1.5, cardH / 2, 'F');

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...BRAND.textMuted);
    pdf.text(k.title, x + 5, rowY + 5.5);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(20);
    pdf.setTextColor(...BRAND.dark);
    pdf.text(k.value, x + 5, rowY + 15);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(90);
    const desc = pdf.splitTextToSize(k.desc, cardW - 9);
    pdf.text(desc, x + 5, rowY + 20);

    col++;
    if (col === 2) { col = 0; rowY += cardH + 4; }
  }
  y = rowY + (col === 0 ? 0 : cardH) + 8;

  // ===== Explicação =====
  if (y + 60 > pageH - margin) { pdf.addPage(); y = margin; }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.setTextColor(...BRAND.dark);
  pdf.text('Por que as métricas não somam exatamente o total de conversas?', margin, y);
  pdf.setFillColor(...BRAND.purple);
  pdf.rect(margin - 3, y - 3.5, 1.2, 4, 'F');
  y += 6;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(60);
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
    pdf.setTextColor(...BRAND.purple);
    pdf.text('•', margin, y);
    pdf.setTextColor(60);
    pdf.text(lines, margin + 5, y);
    y += lines.length * 5 + 1;
  }

  y += 3;
  const closing = pdf.splitTextToSize(
    'Por isso somar Pausadas + Transferidas + Agendamentos pode ultrapassar o Total de conversas. A % Resolução da IA assume essa sobreposição como proxy de eficácia.',
    contentW,
  );
  if (y + closing.length * 5 > pageH - margin) { pdf.addPage(); y = margin; }
  pdf.setTextColor(60);
  pdf.text(closing, margin, y);
  y += closing.length * 5 + 6;

  // Observação
  if (y + 20 > pageH - margin) { pdf.addPage(); y = margin; }
  pdf.setDrawColor(...BRAND.cardBorder);
  pdf.line(margin, y, pageW - margin, y);
  y += 5;
  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(9);
  pdf.setTextColor(...BRAND.textMuted);
  const obs = pdf.splitTextToSize(
    'Obs.: a distinção "pausado por humano vs IA" começou a ser registrada em 11/05/2026 — conversas pausadas antes dessa data aparecem como pausadas pela IA.',
    contentW,
  );
  pdf.text(obs, margin, y);

  // Footer com identidade 2M Digital
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    // faixa gradiente fina no rodapé
    pdf.setFillColor(...BRAND.blue);
    pdf.rect(0, pageH - 12, pageW / 2, 0.8, 'F');
    pdf.setFillColor(...BRAND.purple);
    pdf.rect(pageW / 2, pageH - 12, pageW / 2, 0.8, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...BRAND.dark);
    pdf.text('2M Digital', margin, pageH - 6);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...BRAND.textMuted);
    pdf.text('  •  Relatórios', margin + 13, pageH - 6);

    pdf.setTextColor(...BRAND.textMuted);
    pdf.text(`Página ${i} de ${pageCount}`, pageW - margin, pageH - 6, { align: 'right' });
  }

  const fname = `2m-digital-relatorio-visao-geral-${now.toISOString().slice(0, 10)}.pdf`;
  pdf.save(fname);
}
