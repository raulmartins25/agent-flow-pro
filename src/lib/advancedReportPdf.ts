import jsPDF from "jspdf";
import logoUrl from "@/assets/2m-digital-logo.png";

const BRAND = {
  blue: [37, 99, 235] as [number, number, number],
  purple: [124, 58, 237] as [number, number, number],
  dark: [45, 45, 55] as [number, number, number],
  textMuted: [110, 116, 130] as [number, number, number],
  cardBg: [248, 249, 252] as [number, number, number],
  cardBorder: [225, 228, 235] as [number, number, number],
  green: [37, 211, 102] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  orange: [234, 88, 12] as [number, number, number],
};

export interface AdvancedReportData {
  agent: { id: string; name: string };
  period: { from: string | null; to: string | null };
  kpis: {
    total_conversas: number;
    contatos_unicos: number;
    agendamentos: number;
    transferidas: number;
    pausadas: number;
    perdidas_estim: number;
    taxa_resolucao_pct: number;
    total_mensagens: number;
    msgs_inbound: number;
    msgs_outbound: number;
    media_msgs_por_conversa: number;
    horario_pico_brt: number;
    amostra_analisada: number;
  };
  analysis: {
    resumo_executivo?: string;
    pontos_fortes?: { titulo: string; descricao: string }[];
    pontos_fracos?: { titulo: string; descricao: string; impacto?: string }[];
    top_objecoes?: { objecao: string; frequencia_estimada?: string; como_ia_responde?: string; sugestao?: string }[];
    faqs_recorrentes?: { pergunta: string; sugestao_resposta_automatica: string }[];
    exemplos_bons?: { contexto: string; por_que_funcionou: string }[];
    exemplos_ruins?: { contexto: string; o_que_faltou: string; correcao_sugerida: string }[];
    recomendacoes?: { acao: string; prioridade?: string; impacto_esperado?: string }[];
    proximos_passos_comerciais?: string[];
  };
}

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
  } catch { return null; }
}

export async function exportAdvancedReportPDF(data: AdvancedReportData, clientLabel?: string) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;

  const now = new Date();
  const stamp = now.toLocaleString("pt-BR");
  const logoData = await loadLogoDataUrl();

  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("pt-BR") : "—";
  const periodLabel = `${fmtDate(data.period.from)} a ${fmtDate(data.period.to)}`;

  const drawHeader = (title: string) => {
    pdf.setFillColor(...BRAND.blue);
    pdf.rect(0, 0, pageW / 2, 3, "F");
    pdf.setFillColor(...BRAND.purple);
    pdf.rect(pageW / 2, 0, pageW / 2, 3, "F");
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 3, pageW, 24, "F");
    if (logoData) {
      try { pdf.addImage(logoData, "PNG", margin, 7, 34, 11); } catch { /* ignore */ }
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(...BRAND.dark);
    pdf.text(title, pageW - margin, 13, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...BRAND.textMuted);
    pdf.text(`Período: ${periodLabel}`, pageW - margin, 18, { align: "right" });
    pdf.setFillColor(...BRAND.blue);
    pdf.rect(0, 27, pageW / 2, 0.8, "F");
    pdf.setFillColor(...BRAND.purple);
    pdf.rect(pageW / 2, 27, pageW / 2, 0.8, "F");
  };

  const drawFooter = () => {
    const pageCount = pdf.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFillColor(...BRAND.blue);
      pdf.rect(0, pageH - 12, pageW / 2, 0.8, "F");
      pdf.setFillColor(...BRAND.purple);
      pdf.rect(pageW / 2, pageH - 12, pageW / 2, 0.8, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(...BRAND.dark);
      pdf.text("2M Digital", margin, pageH - 6);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...BRAND.textMuted);
      pdf.text(`  •  Relatório Avançado IA — ${data.agent.name}`, margin + 13, pageH - 6);
      pdf.text(`Página ${i} de ${pageCount}`, pageW - margin, pageH - 6, { align: "right" });
    }
  };

  let y = 0;
  const ensure = (need: number, title?: string) => {
    if (y + need > pageH - 18) {
      pdf.addPage();
      drawHeader(title ?? `Relatório Avançado — ${data.agent.name}`);
      y = 34;
    }
  };

  const sectionTitle = (txt: string) => {
    ensure(12);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(...BRAND.dark);
    pdf.text(txt, margin, y);
    pdf.setFillColor(...BRAND.purple);
    pdf.rect(margin - 3, y - 3.8, 1.4, 4.5, "F");
    y += 7;
  };

  const para = (txt: string, size = 10, color: [number, number, number] = [60, 60, 60]) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(txt, contentW);
    ensure(lines.length * (size * 0.42) + 2);
    pdf.text(lines, margin, y);
    y += lines.length * (size * 0.42) + 2;
  };

  // ===== PAGE 1: Cover =====
  pdf.setFillColor(...BRAND.dark);
  pdf.rect(0, 0, pageW, pageH, "F");
  pdf.setFillColor(...BRAND.blue);
  pdf.rect(0, 0, pageW, 6, "F");
  pdf.setFillColor(...BRAND.purple);
  pdf.rect(0, pageH - 6, pageW, 6, "F");
  if (logoData) {
    try { pdf.addImage(logoData, "PNG", pageW / 2 - 30, 40, 60, 20); } catch { /* ignore */ }
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(28);
  pdf.setTextColor(255, 255, 255);
  pdf.text("Relatório Avançado", pageW / 2, 95, { align: "center" });
  pdf.setFontSize(22);
  pdf.text("de Desempenho da IA", pageW / 2, 107, { align: "center" });
  pdf.setFontSize(18);
  pdf.setTextColor(...BRAND.green);
  pdf.text(`Agente ${data.agent.name}`, pageW / 2, 130, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.setTextColor(200, 200, 210);
  pdf.text(`Período analisado: ${periodLabel}`, pageW / 2, 145, { align: "center" });
  if (clientLabel) pdf.text(`Cliente: ${clientLabel}`, pageW / 2, 153, { align: "center" });
  pdf.setFontSize(9);
  pdf.setTextColor(160, 160, 170);
  pdf.text(`Gerado em ${stamp}  •  Análise feita por IA com base em ${data.kpis.amostra_analisada} conversas reais`, pageW / 2, pageH - 25, { align: "center" });

  // ===== PAGE 2: Resumo + KPIs =====
  pdf.addPage();
  drawHeader(`Relatório Avançado — ${data.agent.name}`);
  y = 34;

  sectionTitle("Resumo executivo");
  para(data.analysis.resumo_executivo ?? "Sem resumo disponível.", 10, [50, 50, 50]);
  y += 3;

  sectionTitle("Indicadores principais");
  const kpis = [
    { t: "Conversas atendidas", v: String(data.kpis.total_conversas), d: `${data.kpis.contatos_unicos} contatos únicos` },
    { t: "Agendamentos gerados", v: String(data.kpis.agendamentos), d: "agendamentos confirmados no período" },
    { t: "Transferidas p/ humano", v: String(data.kpis.transferidas), d: "casos que a IA encaminhou" },
    { t: "Taxa de resolução IA", v: `${data.kpis.taxa_resolucao_pct}%`, d: "(agendamentos + transferências) / conversas" },
    { t: "Mensagens trocadas", v: String(data.kpis.total_mensagens), d: `média de ${data.kpis.media_msgs_por_conversa} msgs por conversa` },
    { t: "Horário de pico", v: `${String(data.kpis.horario_pico_brt).padStart(2, "0")}h`, d: "maior volume de mensagens recebidas (BRT)" },
  ];
  const cardW = (contentW - 6) / 2;
  const cardH = 26;
  let col = 0;
  for (const k of kpis) {
    ensure(cardH + 4);
    const x = margin + col * (cardW + 6);
    pdf.setDrawColor(...BRAND.cardBorder);
    pdf.setFillColor(...BRAND.cardBg);
    pdf.roundedRect(x, y, cardW, cardH, 2.5, 2.5, "FD");
    pdf.setFillColor(...BRAND.blue);
    pdf.rect(x, y, 1.5, cardH / 2, "F");
    pdf.setFillColor(...BRAND.purple);
    pdf.rect(x, y + cardH / 2, 1.5, cardH / 2, "F");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...BRAND.textMuted);
    pdf.text(k.t, x + 5, y + 5);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.setTextColor(...BRAND.dark);
    pdf.text(k.v, x + 5, y + 14);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(90);
    const d = pdf.splitTextToSize(k.d, cardW - 9);
    pdf.text(d, x + 5, y + 19);
    col++;
    if (col === 2) { col = 0; y += cardH + 4; }
  }
  if (col === 1) y += cardH + 4;

  // ===== Pontos fortes =====
  sectionTitle("O que a IA está fazendo bem");
  for (const p of data.analysis.pontos_fortes ?? []) {
    ensure(14);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(...BRAND.green);
    pdf.text("✓", margin, y);
    pdf.setTextColor(...BRAND.dark);
    pdf.text(p.titulo, margin + 5, y);
    y += 4.5;
    para(p.descricao, 9, [70, 70, 70]);
    y += 1;
  }

  // ===== Pontos fracos =====
  sectionTitle("Pontos de melhoria");
  for (const p of data.analysis.pontos_fracos ?? []) {
    ensure(16);
    const impColor = p.impacto === "alto" ? BRAND.red : p.impacto === "medio" ? BRAND.orange : BRAND.textMuted;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(...impColor);
    pdf.text("●", margin, y);
    pdf.setTextColor(...BRAND.dark);
    pdf.text(p.titulo, margin + 5, y);
    if (p.impacto) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(...impColor);
      pdf.text(`  [impacto ${p.impacto}]`, margin + 5 + pdf.getTextWidth(p.titulo), y);
    }
    y += 4.5;
    para(p.descricao, 9, [70, 70, 70]);
    y += 1;
  }

  // ===== Objeções =====
  if (data.analysis.top_objecoes?.length) {
    sectionTitle("Principais objeções dos leads");
    for (const o of data.analysis.top_objecoes) {
      ensure(22);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(...BRAND.dark);
      pdf.text(`• ${o.objecao}`, margin, y);
      if (o.frequencia_estimada) {
        pdf.setFont("helvetica", "italic");
        pdf.setFontSize(8);
        pdf.setTextColor(...BRAND.textMuted);
        pdf.text(`  (${o.frequencia_estimada})`, margin + pdf.getTextWidth(`• ${o.objecao}`), y);
      }
      y += 4.5;
      if (o.como_ia_responde) para(`Como a IA responde hoje: ${o.como_ia_responde}`, 9, [70, 70, 70]);
      if (o.sugestao) para(`Sugestão: ${o.sugestao}`, 9, [...BRAND.blue] as [number, number, number]);
      y += 1;
    }
  }

  // ===== FAQs =====
  if (data.analysis.faqs_recorrentes?.length) {
    sectionTitle("Perguntas frequentes (podem virar respostas prontas)");
    for (const f of data.analysis.faqs_recorrentes) {
      ensure(14);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9.5);
      pdf.setTextColor(...BRAND.dark);
      const q = pdf.splitTextToSize(`P: ${f.pergunta}`, contentW);
      pdf.text(q, margin, y);
      y += q.length * 4 + 1;
      para(`R sugerida: ${f.sugestao_resposta_automatica}`, 9, [70, 70, 70]);
      y += 1;
    }
  }

  // ===== Exemplos bons =====
  if (data.analysis.exemplos_bons?.length) {
    sectionTitle("Casos em que a IA brilhou");
    for (const e of data.analysis.exemplos_bons) {
      ensure(16);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9.5);
      pdf.setTextColor(...BRAND.green);
      pdf.text("★", margin, y);
      pdf.setTextColor(...BRAND.dark);
      const ctx = pdf.splitTextToSize(e.contexto, contentW - 6);
      pdf.text(ctx, margin + 5, y);
      y += ctx.length * 4 + 1;
      para(e.por_que_funcionou, 9, [70, 70, 70]);
      y += 1;
    }
  }

  // ===== Exemplos ruins =====
  if (data.analysis.exemplos_ruins?.length) {
    sectionTitle("Casos que precisam de ajuste");
    for (const e of data.analysis.exemplos_ruins) {
      ensure(20);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9.5);
      pdf.setTextColor(...BRAND.red);
      pdf.text("⚠", margin, y);
      pdf.setTextColor(...BRAND.dark);
      const ctx = pdf.splitTextToSize(e.contexto, contentW - 6);
      pdf.text(ctx, margin + 5, y);
      y += ctx.length * 4 + 1;
      para(`O que faltou: ${e.o_que_faltou}`, 9, [70, 70, 70]);
      para(`Correção: ${e.correcao_sugerida}`, 9, [...BRAND.blue] as [number, number, number]);
      y += 1;
    }
  }

  // ===== Recomendações =====
  if (data.analysis.recomendacoes?.length) {
    sectionTitle("Plano de ação recomendado");
    for (const r of data.analysis.recomendacoes) {
      ensure(14);
      const pColor = r.prioridade === "alta" ? BRAND.red : r.prioridade === "media" ? BRAND.orange : BRAND.green;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9.5);
      pdf.setTextColor(...pColor);
      pdf.text(`[${(r.prioridade ?? "média").toUpperCase()}]`, margin, y);
      pdf.setTextColor(...BRAND.dark);
      const acaoX = margin + pdf.getTextWidth(`[${(r.prioridade ?? "média").toUpperCase()}] `);
      const acao = pdf.splitTextToSize(r.acao, contentW - (acaoX - margin));
      pdf.text(acao, acaoX, y);
      y += acao.length * 4 + 1;
      if (r.impacto_esperado) para(`Impacto esperado: ${r.impacto_esperado}`, 8.5, [90, 90, 90]);
      y += 1;
    }
  }

  // ===== Próximos passos =====
  if (data.analysis.proximos_passos_comerciais?.length) {
    sectionTitle("Próximos passos para evoluir o serviço");
    for (const p of data.analysis.proximos_passos_comerciais) {
      ensure(10);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(...BRAND.purple);
      pdf.text("→", margin, y);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(...BRAND.dark);
      const lines = pdf.splitTextToSize(p, contentW - 6);
      pdf.text(lines, margin + 5, y);
      y += lines.length * 4.5 + 2;
    }
  }

  // ===== Observação final =====
  ensure(20);
  y += 4;
  pdf.setDrawColor(...BRAND.cardBorder);
  pdf.line(margin, y, pageW - margin, y);
  y += 5;
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...BRAND.textMuted);
  const obs = pdf.splitTextToSize(
    `Análise gerada por IA com base em amostra estratificada de ${data.kpis.amostra_analisada} conversas reais do agente ${data.agent.name} no período de ${periodLabel}. Nomes e telefones foram anonimizados. Relatório elaborado por 2M Digital.`,
    contentW,
  );
  pdf.text(obs, margin, y);

  drawFooter();
  const fname = `2m-digital-relatorio-avancado-${data.agent.name.toLowerCase().replace(/\s+/g, "-")}-${now.toISOString().slice(0, 10)}.pdf`;
  pdf.save(fname);
}
