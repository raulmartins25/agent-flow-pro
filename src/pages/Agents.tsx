import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Bot, Plus, TestTube, Smartphone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function Agents() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAgents = async () => {
    const { data, error } = await supabase.from('agents').select('*, devices(name, phone_number)').order('created_at', { ascending: false });
    if (error) console.error(error);
    setAgents(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchAgents(); }, []);

  const toggleStatus = async (agent: any) => {
    const newStatus = agent.status === 'active' ? 'inactive' : 'active';

    // Block if activating and device already has another active agent
    if (newStatus === 'active' && agent.device_id) {
      const { data: existing } = await supabase
        .from('agents')
        .select('id, name')
        .eq('device_id', agent.device_id)
        .eq('status', 'active')
        .neq('id', agent.id);
      if (existing && existing.length > 0) {
        toast.error(`Dispositivo já tem agente ativo: ${existing[0].name}`);
        return;
      }
    }

    const { error } = await supabase.from('agents').update({ status: newStatus }).eq('id', agent.id);
    if (error) { toast.error(error.message); return; }
    toast.success(newStatus === 'active' ? 'Agente ativado' : 'Agente desativado');
    fetchAgents();
  };

  const statusColors: Record<string, string> = {
    active: 'bg-primary/20 text-primary',
    paused: 'bg-warning/20 text-warning',
    inactive: 'bg-muted text-muted-foreground',
  };

  const typeLabels: Record<string, string> = {
    receptive: 'Receptivo',
    prospecting: 'Prospecção',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agentes</h1>
          <p className="text-muted-foreground">Gerencie seus agentes de IA</p>
        </div>
        <Button asChild>
          <Link to="/agents/new"><Plus className="mr-2 h-4 w-4" />Novo agente</Link>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : agents.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Bot className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Nenhum agente criado</h3>
            <p className="text-muted-foreground mb-4">Crie seu primeiro agente para começar</p>
            <Button asChild><Link to="/agents/new"><Plus className="mr-2 h-4 w-4" />Criar agente</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Card key={agent.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{agent.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={agent.status === 'active'}
                    onCheckedChange={() => toggleStatus(agent)}
                  />
                  <Badge variant="secondary" className={statusColors[agent.status] || ''}>
                    {agent.status === 'active' ? 'Ativo' : agent.status === 'paused' ? 'Pausado' : 'Inativo'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline">{typeLabels[agent.type] || agent.type}</Badge>
                  {agent.devices && (
                    <Badge variant="outline" className="gap-1">
                      <Smartphone className="h-3 w-3" />
                      {agent.devices.name}
                      {agent.devices.phone_number && ` (${agent.devices.phone_number})`}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/agents/${agent.id}/simulator`}>
                      <TestTube className="mr-1 h-3 w-3" />Simulador
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
