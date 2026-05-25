import { useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Bot, MessageSquare, Hand, UserCheck, CalendarCheck, TrendingUp, Download, Info, FileText, CalendarIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useReports, type ReportFilters } from '@/hooks/useReports';
import { exportReportCSV } from '@/lib/reportsExport';
import { exportOverviewPDF } from '@/lib/reportsPdf';
import { useUserRole } from '@/hooks/useUserRole';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';

export default function ReportsPage() {
  const { isClient, loading: roleLoading } = useUserRole();
  const [filters, setFilters] = useState<ReportFilters>({ period: '30d', agentId: 'all', deviceId: 'all' });
  const { rows, totals, daily, agents, devices, loading } = useReports(filters);
  const overviewRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const periodLabel = filters.period === 'today' ? 'Hoje' : filters.period === '7d' ? 'Últimos 7 dias' : 'Últimos 30 dias';
  const agentLabel = !filters.agentId || filters.agentId === 'all' ? 'Todos' : (agents.find(a => a.id === filters.agentId)?.name ?? '—');
  const deviceLabel = !filters.deviceId || filters.deviceId === 'all' ? 'Todos' : (devices.find(d => d.id === filters.deviceId)?.name ?? '—');

  const handleExportPDF = async () => {
    if (!totals) return;
    setExporting(true);
    try {
      await exportOverviewPDF(totals, { periodLabel, agentLabel, deviceLabel });
      toast.success('Relatório PDF gerado');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar PDF');
    } finally {
      setExporting(false);
    }
  };


  const kpis = useMemo(
    () => [
      {
        title: 'Total de conversas iniciadas',
        value: totals?.attendances ?? 0,
        icon: MessageSquare,
        color: 'text-primary',
        description: 'Contatos únicos que iniciaram conversa no período (mesma contagem do Inbox).',
      },
      {
        title: 'Pausadas (Inbox)',
        value: totals?.paused ?? 0,
        icon: Hand,
        color: 'text-warning',
        description: 'Conversas pausadas — todas que aparecem em amarelo no Inbox (humano assumiu ou foi pausada após transferência).',
      },
      {
        title: 'Transferidas pela IA',
        value: totals?.ai_transfers ?? 0,
        icon: UserCheck,
        color: 'text-info',
        description: 'Conversas que a IA transferiu para um humano — todas que aparecem em azul no Inbox (status transferido).',
      },
      {
        title: 'Agendamentos feitos',
        value: totals?.appointments ?? 0,
        icon: CalendarCheck,
        color: 'text-primary',
        description: 'Total de agendamentos confirmados/criados pelo agente no período.',
      },
      {
        title: '% Resolução da IA',
        value: `${totals?.resolution_pct ?? 0}%`,
        icon: TrendingUp,
        color: 'text-primary',
        description: '(Agendamentos + transferências feitas pela IA) ÷ total de conversas iniciadas. Mede quantos atendimentos a IA conseguiu resolver ou encaminhar.',
      },
    ],
    [totals],
  );

  if (roleLoading) return null;
  if (isClient) return <Navigate to="/inbox" replace />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">Métricas de desempenho por agente e dispositivo</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Período</label>
            <Select value={filters.period} onValueChange={(v) => setFilters({ ...filters, period: v as any })}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Agente</label>
            <Select value={filters.agentId} onValueChange={(v) => setFilters({ ...filters, agentId: v })}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {agents.map((a) => (<SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Dispositivo</label>
            <Select value={filters.deviceId} onValueChange={(v) => setFilters({ ...filters, deviceId: v })}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {devices.map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="detailed">Detalhado</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={exporting}>
                  <FileText className="mr-2 h-4 w-4" /> {exporting ? 'Gerando…' : 'Exportar PDF'}
                </Button>
              </div>
              <div ref={overviewRef} className="space-y-6 bg-background p-2">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {kpis.map((card) => (
                  <Card key={card.title}>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                      <card.icon className={`h-5 w-5 ${card.color}`} />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{card.value}</div>
                      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{card.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs leading-relaxed space-y-2">
                  <p className="font-semibold text-foreground">Por que as métricas não somam exatamente o total de conversas?</p>
                  <p>
                    As métricas <strong>não são mutuamente exclusivas</strong> e usam regras de contagem diferentes:
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><strong>Conversas iniciadas</strong> conta <em>contatos únicos</em> — se o mesmo número abriu 2 conversas, soma 1.</li>
                    <li><strong>Pausadas</strong> e <strong>Transferidas IA</strong> contam cada conversa individualmente, sem deduplicar por contato.</li>
                    <li>Uma mesma conversa pode estar <strong>pausada e transferida</strong> ao mesmo tempo — entra nas duas categorias.</li>
                    <li><strong>Agendamentos</strong> são uma entidade separada — uma conversa pode gerar mais de um agendamento.</li>
                  </ul>
                  <p>
                    Por isso somar Pausadas + Transferidas + Agendamentos pode ultrapassar o Total de conversas. A <strong>% Resolução da IA</strong> assume essa sobreposição como proxy de eficácia.
                  </p>
                  <p className="pt-1 border-t border-border">
                    Obs.: a distinção “pausado por humano vs IA” começou a ser registrada em <strong>11/05/2026</strong> — conversas pausadas antes dessa data aparecem como pausadas pela IA.
                  </p>
                </AlertDescription>
              </Alert>
              </div>

              <Card>
                <CardHeader><CardTitle>Evolução no período</CardTitle></CardHeader>
                <CardContent>
                  <ChartContainer
                    className="h-72 w-full"
                    config={{
                      attendances: { label: 'Conversas iniciadas', color: 'hsl(var(--primary))' },
                      appointments: { label: 'Agendamentos', color: 'hsl(var(--warning))' },
                    }}
                  >
                    <LineChart data={daily}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} />
                      <YAxis allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line type="monotone" dataKey="attendances" stroke="var(--color-attendances)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="appointments" stroke="var(--color-appointments)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="detailed" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => exportReportCSV(rows)} disabled={!rows.length}>
              <Download className="mr-2 h-4 w-4" /> Exportar CSV
            </Button>
          </div>
          <Card>
            <CardContent className="pt-6 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead><Bot className="inline h-4 w-4 mr-1" />Agente</TableHead>
                    <TableHead>Dispositivo</TableHead>
                    <TableHead className="text-right">Conversas</TableHead>
                    <TableHead className="text-right">Pausadas</TableHead>
                    <TableHead className="text-right">Transferidas IA</TableHead>
                    <TableHead className="text-right">Agendamentos</TableHead>
                    <TableHead className="text-right">% Resolução IA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8">Carregando…</TableCell></TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sem dados no período.</TableCell></TableRow>
                  ) : rows.map((r) => (
                    <TableRow key={r.agent_id}>
                      <TableCell className="font-medium">{r.agent_name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.device_name ?? '—'}</TableCell>
                      <TableCell className="text-right">{r.attendances}</TableCell>
                      <TableCell className="text-right">{r.paused}</TableCell>
                      <TableCell className="text-right">{r.ai_transfers}</TableCell>
                      <TableCell className="text-right">{r.appointments}</TableCell>
                      <TableCell className="text-right font-semibold">{r.resolution_pct}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
