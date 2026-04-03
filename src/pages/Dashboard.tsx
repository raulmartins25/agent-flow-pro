import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, MessageSquare, Megaphone, TrendingUp, Zap, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function Dashboard() {
  const [stats, setStats] = useState({
    agents: 0,
    activeConvosToday: 0,
    totalConversations: 0,
    runningBlasts: 0,
    monthlyMessages: 0,
    qualificationRate: 0,
    transferredToday: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

      const [
        agentsRes,
        activeConvosRes,
        totalConvsRes,
        runningBlastsRes,
        monthlyMsgsRes,
        transferredRes,
        totalFinishedRes,
      ] = await Promise.all([
        supabase.from('agents').select('id', { count: 'exact', head: true }),
        supabase.from('conversations').select('id', { count: 'exact', head: true })
          .eq('status', 'active').gte('last_message_at', todayISO),
        supabase.from('conversations').select('id', { count: 'exact', head: true }),
        supabase.from('blast_campaigns').select('id', { count: 'exact', head: true })
          .eq('status', 'running'),
        supabase.from('messages').select('id', { count: 'exact', head: true })
          .gte('created_at', monthStart),
        supabase.from('conversations').select('id', { count: 'exact', head: true })
          .eq('status', 'transferred').gte('created_at', todayISO),
        supabase.from('conversations').select('id', { count: 'exact', head: true })
          .in('status', ['transferred', 'closed']),
      ]);

      const totalFinished = totalFinishedRes.count ?? 0;
      const transferred = transferredRes.count ?? 0;
      const totalConvs = totalConvsRes.count ?? 0;
      const qualRate = totalConvs > 0 ? Math.round(((totalFinished) / totalConvs) * 100) : 0;

      setStats({
        agents: agentsRes.count ?? 0,
        activeConvosToday: activeConvosRes.count ?? 0,
        totalConversations: totalConvs,
        runningBlasts: runningBlastsRes.count ?? 0,
        monthlyMessages: monthlyMsgsRes.count ?? 0,
        qualificationRate: qualRate,
        transferredToday: transferred,
      });
      setLoading(false);
    };
    fetchStats();
  }, []);

  const cards = [
    { title: 'Agentes', value: stats.agents, icon: Bot, color: 'text-primary' },
    { title: 'Conversas ativas hoje', value: stats.activeConvosToday, icon: MessageSquare, color: 'text-primary' },
    { title: 'Disparos rodando', value: stats.runningBlasts, icon: Megaphone, color: 'text-warning' },
    { title: 'Mensagens no mês', value: stats.monthlyMessages.toLocaleString('pt-BR'), icon: Zap, color: 'text-info' },
    { title: 'Taxa de qualificação', value: `${stats.qualificationRate}%`, icon: TrendingUp, color: 'text-primary' },
    { title: 'Transferidos hoje', value: stats.transferredToday, icon: CheckCircle2, color: 'text-primary' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral da sua plataforma</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{card.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
