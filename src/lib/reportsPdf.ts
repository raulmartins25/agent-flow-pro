import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface PdfMeta {
  periodLabel: string;
  agentLabel: string;
  deviceLabel: string;
}

export async function exportOverviewPDF(element: HTMLElement, meta: PdfMeta) {
  // Resolve current background color from CSS to avoid html2canvas issues with oklch/var()
  const bg = getComputedStyle(document.body).backgroundColor || '#ffffff';

  const canvas = await html2canvas(element, {
    backgroundColor: bg,
    scale: 2,
    useCORS: true,
    logging: false,
    windowWidth: element.scrollWidth,
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const contentW = pageWidth - margin * 2;

  // Header
  const now = new Date();
  const stamp = now.toLocaleString('pt-BR');
  pdf.setFontSize(16);
  pdf.text('Relatório — Visão Geral', margin, margin + 4);
  pdf.setFontSize(9);
  pdf.setTextColor(110);
  pdf.text(
    `Período: ${meta.periodLabel}   |   Agente: ${meta.agentLabel}   |   Dispositivo: ${meta.deviceLabel}`,
    margin,
    margin + 10,
  );
  pdf.text(`Gerado em ${stamp}`, margin, margin + 14);
  pdf.setTextColor(0);

  const headerH = 18;
  const imgW = contentW;
  const imgH = (canvas.height * imgW) / canvas.width;

  // Slice canvas across pages if needed
  const pageContentH = pageHeight - margin * 2 - headerH;
  if (imgH <= pageContentH) {
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin + headerH, imgW, imgH);
  } else {
    const pxPerMm = canvas.width / imgW;
    const sliceHpx = Math.floor(pageContentH * pxPerMm);
    let yPx = 0;
    let firstPage = true;
    while (yPx < canvas.height) {
      const hPx = Math.min(sliceHpx, canvas.height - yPx);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = hPx;
      const ctx = slice.getContext('2d')!;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, yPx, canvas.width, hPx, 0, 0, canvas.width, hPx);
      const sliceMmH = hPx / pxPerMm;
      if (!firstPage) {
        pdf.addPage();
        pdf.setFontSize(9);
        pdf.setTextColor(110);
        pdf.text(`Relatório — Visão Geral   |   ${stamp}`, margin, margin + 4);
        pdf.setTextColor(0);
      }
      pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin + (firstPage ? headerH : 8), imgW, sliceMmH);
      yPx += hPx;
      firstPage = false;
    }
  }

  const fname = `relatorio-visao-geral-${now.toISOString().slice(0, 10)}.pdf`;
  pdf.save(fname);
}
