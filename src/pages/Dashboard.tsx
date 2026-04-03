import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, MessageSquare, Megaphone, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function Dashboard() {
  const [stats, setStats] = useState({ agents: 0, conversations: 0, campaigns: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      const [agentsRes, convsRes, campsRes] = await Promise.all([
        supabase.from('agents').select('id', { count: 'exact', head: true }),
        supabase.from('conversations').select('id', { count: 'exact', head: true }),
        supabase.from('blast_campaigns').select('id', { count: 'exact', head: true }),
      ]);
      setStats({
        agents: agentsRes.count ?? 0,
        conversations: convsRes.count ?? 0,
        campaigns: campsRes.count ?? 0,
      });
    };
    fetchStats();
  }, []);

  const cards = [
    { title: 'Agentes', value: stats.agents, icon: Bot, color: 'text-primary' },
    { title: 'Conversas', value: stats.conversations, icon: MessageSquare, color: 'text-info' },
    { title: 'Campanhas', value: stats.campaigns, icon: Megaphone, color: 'text-warning' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral da sua plataforma</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
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
    </div>
  );
}
