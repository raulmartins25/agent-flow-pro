import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Play, Pause, StopCircle, Download, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export default function BlastDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetch = async () => {
      const { data: camp } = await supabase
        .from('blast_campaigns')
        .select('*, agents(name)')
        .eq('id', id)
        .single();
      setCampaign(camp);

      const { data: conts } = await supabase
        .from('blast_contacts')
        .select('*')
        .eq('campaign_id', id)
        .order('sent_at', { ascending: false });
      setContacts(conts ?? []);
      setLoading(false);
    };
    fetch();

    // Realtime for campaign updates
    const campChannel = supabase
      .channel(`campaign-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'blast_campaigns',
        filter: `id=eq.${id}`,
      }, (payload: RealtimePostgresChangesPayload<any>) => {
        setCampaign((prev: any) => prev ? { ...prev, ...payload.new } : payload.new);
      })
      .subscribe();

    // Realtime for contact updates
    const contChannel = supabase
      .channel(`contacts-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'blast_contacts',
        filter: `campaign_id=eq.${id}`,
      }, (payload: RealtimePostgresChangesPayload<any>) => {
        setContacts(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(campChannel);
      supabase.removeChannel(contChannel);
    };
  }, [id]);

  const startCampaign = async () => {
    if (!id) return;
    try {
      const { error } = await supabase.functions.invoke('blast-processor', {
        body: { campaign_id: id },
      });
      if (error) throw error;
      toast.success('Campanha iniciada!');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao iniciar');
    }
  };

  const pauseCampaign = async () => {
    if (!id) return;
    await supabase.from('blast_campaigns').update({ status: 'paused' }).eq('id', id);
    toast.success('Campanha pausada');
  };

  const cancelCampaign = async () => {
    if (!id) return;
    await supabase.from('blast_campaigns').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id);
    toast.success('Campanha cancelada');
  };

  const exportCSV = () => {
    const headers = ['Nome', 'Telefone', 'Status', 'Erro', 'Enviado em'];
    const rows = contacts.map(c => [
      c.name || '', c.phone, c.status, c.error_message || '',
      c.sent_at ? new Date(c.sent_at).toLocaleString('pt-BR') : '',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campanha-${id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !campaign) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Derive stats from contacts array (single source of truth)
  const sentCount = contacts.filter((c: any) => c.status === 'sent').length;
  const errorCount = contacts.filter((c: any) => c.status === 'error').length;
  const pendingCount = contacts.filter((c: any) => c.status === 'pending').length;
  const totalContacts = campaign.total_contacts || contacts.length;
  const progress = totalContacts > 0 ? (sentCount / totalContacts) * 100 : 0;
  const statusColors: Record<string, string> = {
    pending: 'bg-muted text-muted-foreground',
    running: 'bg-primary/20 text-primary',
    paused: 'bg-warning/20 text-warning',
    completed: 'bg-success/20 text-success',
    error: 'bg-destructive/20 text-destructive',
  };

  const contactStatusColors: Record<string, string> = {
    pending: 'text-muted-foreground',
    sent: 'text-primary',
    error: 'text-destructive',
    replied: 'text-info',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/blasts')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{campaign.name}</h1>
            <p className="text-sm text-muted-foreground">{campaign.agents?.name || 'Agente'}</p>
          </div>
          <Badge variant="secondary" className={statusColors[campaign.status] || ''}>{campaign.status}</Badge>
          {campaign.scheduled_at && campaign.status === 'pending' && (
            <Badge variant="outline" className="text-xs">
              📅 Agendado para {new Date(campaign.scheduled_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} (Brasília)
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {campaign.status === 'pending' && (
            <Button onClick={startCampaign}><Play className="mr-1 h-4 w-4" />Iniciar</Button>
          )}
          {campaign.status === 'running' && (
            <Button variant="outline" onClick={pauseCampaign}><Pause className="mr-1 h-4 w-4" />Pausar</Button>
          )}
          {campaign.status === 'paused' && (
            <Button onClick={startCampaign}><Play className="mr-1 h-4 w-4" />Continuar</Button>
          )}
          {['running', 'paused'].includes(campaign.status) && (
            <Button variant="destructive" onClick={cancelCampaign}><StopCircle className="mr-1 h-4 w-4" />Cancelar</Button>
          )}
          <Button variant="outline" onClick={exportCSV}><Download className="mr-1 h-4 w-4" />Exportar CSV</Button>
        </div>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="pt-6">
          <Progress value={progress} className="h-3 mb-2" />
          <p className="text-sm text-muted-foreground">{sentCount} de {totalContacts} enviados</p>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total', value: totalContacts },
          { label: 'Enviados', value: sentCount },
          { label: 'Erros', value: errorCount },
          { label: 'Pendentes', value: pendingCount },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Contacts table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Contatos</CardTitle></CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Erro</TableHead>
                  <TableHead>Enviado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm">{c.name || '-'}</TableCell>
                    <TableCell className="text-sm font-mono">{c.phone}</TableCell>
                    <TableCell>
                      <span className={`text-sm font-medium ${contactStatusColors[c.status] || ''}`}>{c.status}</span>
                    </TableCell>
                    <TableCell className="text-xs text-destructive max-w-32 truncate">{c.error_message || '-'}</TableCell>
                    <TableCell className="text-xs">
                      {c.sent_at ? new Date(c.sent_at).toLocaleString('pt-BR') : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
