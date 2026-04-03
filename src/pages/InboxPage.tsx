import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function InboxPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase
      .from('conversations')
      .select('*, agents(name)')
      .order('last_message_at', { ascending: false })
      .then(({ data }) => {
        setConversations(data ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = conversations.filter(
    (c) => (c.contact_name || c.contact_number || '').toLowerCase().includes(search.toLowerCase())
  );

  const statusColors: Record<string, string> = {
    active: 'bg-primary/20 text-primary',
    paused: 'bg-warning/20 text-warning',
    transferred: 'bg-info/20 text-info',
    closed: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Inbox</h1>
        <p className="text-muted-foreground">Conversas dos seus agentes</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou número..."
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Nenhuma conversa</h3>
            <p className="text-muted-foreground">As conversas aparecerão aqui quando leads entrarem em contato</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((conv) => (
            <Card key={conv.id} className="hover:border-primary/30 transition-colors cursor-pointer">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                    {(conv.contact_name || conv.contact_number || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{conv.contact_name || conv.contact_number}</p>
                    <p className="text-xs text-muted-foreground">{conv.agents?.name || 'Agente'}</p>
                  </div>
                </div>
                <Badge variant="secondary" className={statusColors[conv.status] || ''}>
                  {conv.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
