import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExternalLink, Search, RefreshCw } from 'lucide-react';

type ConversationLog = {
  id: string;
  contact_number: string;
  contact_name: string | null;
  status: string;
  last_message_at: string | null;
  created_at: string;
  agent_paused: boolean;
  agents: { name: string } | null;
  message_count: number;
};

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'Ativo', variant: 'default' },
  transferred: { label: 'Transferido', variant: 'secondary' },
  closed: { label: 'Encerrado', variant: 'outline' },
  paused: { label: 'Pausado', variant: 'destructive' },
};

export default function LogsPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationLog[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const [agentsRes, convsRes] = await Promise.all([
      supabase.from('agents').select('id, name').eq('user_id', user.id),
      supabase
        .from('conversations')
        .select('id, contact_number, contact_name, status, last_message_at, created_at, agent_paused, agents!inner(name)')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(200),
    ]);

    if (agentsRes.data) setAgents(agentsRes.data);

    if (convsRes.data) {
      // Fetch message counts
      const ids = convsRes.data.map((c) => c.id);
      const { data: msgCounts } = await supabase
        .from('messages')
        .select('conversation_id')
        .in('conversation_id', ids);

      const countMap: Record<string, number> = {};
      msgCounts?.forEach((m) => {
        countMap[m.conversation_id] = (countMap[m.conversation_id] || 0) + 1;
      });

      setConversations(
        convsRes.data.map((c: any) => ({
          ...c,
          agents: c.agents,
          message_count: countMap[c.id] || 0,
        }))
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const filtered = conversations.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (agentFilter !== 'all' && c.agents?.name !== agentFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const match =
        c.contact_number.includes(q) ||
        (c.contact_name || '').toLowerCase().includes(q) ||
        (c.agents?.name || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Logs de Conversas</h1>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por contato ou agente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="transferred">Transferido</SelectItem>
                <SelectItem value="closed">Encerrado</SelectItem>
                <SelectItem value="paused">Pausado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Agente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os agentes</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.name}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Agente</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Msgs</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhuma conversa encontrada
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => {
                  const cfg = statusConfig[c.status] || statusConfig.active;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {c.last_message_at
                          ? format(new Date(c.last_message_at), "dd/MM/yy HH:mm", { locale: ptBR })
                          : format(new Date(c.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="font-medium">{c.agents?.name || '—'}</TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{c.contact_name || 'Sem nome'}</span>
                          <span className="block text-xs text-muted-foreground">{c.contact_number}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-center">{c.message_count}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(`/inbox/${c.id}`)}
                          title="Abrir no Inbox"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
