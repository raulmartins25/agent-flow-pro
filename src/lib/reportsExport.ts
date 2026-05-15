import type { ReportRow } from '@/hooks/useReports';

export function exportReportCSV(rows: ReportRow[], filename = 'relatorio.csv') {
  const header = [
    'Agente',
    'Dispositivo',
    'Conversas iniciadas',
    'Pausa Inbox',
    'Pausa IA',
    'Agendamentos',
    '% Resolução IA',
  ];
  const lines = rows.map((r) =>
    [
      r.agent_name,
      r.device_name ?? '—',
      r.attendances,
      r.human_paused,
      r.ai_paused,
      r.appointments,
      `${r.resolution_pct}%`,
    ]
      .map((v) => {
        const s = String(v ?? '');
        return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      })
      .join(';'),
  );
  const csv = '\uFEFF' + [header.join(';'), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
