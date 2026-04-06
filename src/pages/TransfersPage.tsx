import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, RefreshCw, ExternalLink, UserCheck } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type TransferredLead = {
  id: string;
  contact_number: string;
  contact_name: string | null;
  last_message_at: string | null;
  created_at: string;
  agent_id: string;
  device_id: string | null;
  agents: { name: string; transfer_number: string | null } | null;
  devices: { name: string } | null;
  message_count: number;
};

export default function TransfersPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [leads, setLeads] = useState<TransferredLead[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState('all');

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const { data: agentList } = await supabase
      .from('agents')
      .select('id, name')
      .eq('user_id', user.id);
    setAgents(agentList ?? []);

    const { data: convs } = await supabase
      .from('conversations')
      .select('id, contact_number, contact_name, last_message_at, created_at, agent_id, device_id, agents(name, transfer_number), devices(name)')
      .eq('status', 'transferred')
      .order('last_message_at', { ascending: false })
      .limit(500);

    if (convs) {
      // fetch message counts
      const ids = convs.map((c: any) => c.id);
      const withCounts: TransferredLead[] = [];

      // batch in chunks of 50
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        const { data: msgs } = await supabase
          .from('messages')
          .select('conversation_id')
          .in('conversation_id', chunk);

        const countMap: Record<string, number> = {};
        (msgs ?? []).forEach((m: any) => {
          countMap[m.conversation_id] = (countMap[m.conversation_id] || 0) + 1;
        });

        for (const c of convs.slice(i, i + 50) as any[]) {
          withCounts.push({ ...c, message_count: countMap[c.id] || 0 });
        }
      }

      setLeads(withCounts);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const filtered = leads.filter((l) => {
    const matchSearch =
      (l.contact_name || l.contact_number || '').toLowerCase().includes(search.toLowerCase());
    const matchAgent = agentFilter === 'all' || l.agent_id === agentFilter;
    return matchSearch && matchAgent;
  });

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return format(new Date(d), "dd/MM/yy HH:mm", { locale: ptBR });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCheck className="h-6 w-6 text-primary" />
            Leads Transferidos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} lead{filtered.length !== 1 ? 's' : ''} transferido{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou número..."
            className="pl-9"
          />
        </div>
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todos os agentes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os agentes</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contato</TableHead>
              <TableHead>Agente</TableHead>
              <TableHead>Dispositivo</TableHead>
              <TableHead>Transferido p/</TableHead>
              <TableHead className="text-center">Msgs</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <div className="h-6 w-6 mx-auto animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhum lead transferido encontrado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((l) => (
                <TableRow key={l.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/inbox/${l.id}`)}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{l.contact_name || l.contact_number}</p>
                      {l.contact_name && (
                        <p className="text-xs text-muted-foreground">{l.contact_number}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{(l as any).agents?.name || '—'}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {(l as any).devices?.name || '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {(l as any).agents?.transfer_number || '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="text-xs">{l.message_count}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(l.last_message_at)}
                  </TableCell>
                  <TableCell>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
