import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Bot, MessageSquare, Hand, PauseCircle, CalendarCheck, TrendingUp, Download } from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useReports, type ReportFilters } from '@/hooks/useReports';
import { exportReportCSV } from '@/lib/reportsExport';
import { useUserRole } from '@/hooks/useUserRole';
import { Navigate } from 'react-router-dom';

export default function ReportsPage() {
  const { isClient, loading: roleLoading } = useUserRole();
  const [filters, setFilters] = useState<ReportFilters>({ period: '30d', agentId: 'all', deviceId: 'all' });
  const { rows, totals, daily, agents, devices, loading } = useReports(filters);

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

              <p className="text-xs text-muted-foreground">
                A distinção “pausado por humano vs IA” começou a ser registrada recentemente — conversas pausadas antes desse marco aparecem como pausadas pela IA.
              </p>
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
                    <TableHead className="text-right">Agendamentos</TableHead>
                    <TableHead className="text-right">% Resolução IA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8">Carregando…</TableCell></TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sem dados no período.</TableCell></TableRow>
                  ) : rows.map((r) => (
                    <TableRow key={r.agent_id}>
                      <TableCell className="font-medium">{r.agent_name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.device_name ?? '—'}</TableCell>
                      <TableCell className="text-right">{r.attendances}</TableCell>
                      <TableCell className="text-right">{r.paused}</TableCell>
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
