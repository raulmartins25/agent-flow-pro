import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Megaphone, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';

export default function BlastsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('blast_campaigns')
      .select('*, agents(name)')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setCampaigns(data ?? []);
        setLoading(false);
      });
  }, []);

  const statusColors: Record<string, string> = {
    pending: 'bg-muted text-muted-foreground',
    running: 'bg-primary/20 text-primary',
    paused: 'bg-warning/20 text-warning',
    completed: 'bg-success/20 text-success',
    error: 'bg-destructive/20 text-destructive',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Disparos</h1>
          <p className="text-muted-foreground">Campanhas de prospecção em massa</p>
        </div>
        <Button asChild>
          <Link to="/blasts/new"><Plus className="mr-2 h-4 w-4" />Nova campanha</Link>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Megaphone className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Nenhuma campanha</h3>
            <p className="text-muted-foreground mb-4">Crie sua primeira campanha de prospecção</p>
            <Button asChild><Link to="/blasts/new"><Plus className="mr-2 h-4 w-4" />Nova campanha</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <Card key={c.id} className="hover:border-primary/30 transition-colors">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.agents?.name || 'Agente'}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-32">
                    <Progress value={c.total_contacts > 0 ? (c.sent_count / c.total_contacts) * 100 : 0} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">{c.sent_count}/{c.total_contacts}</p>
                  </div>
                  <Badge variant="secondary" className={statusColors[c.status] || ''}>{c.status}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
