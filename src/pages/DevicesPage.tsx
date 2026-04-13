import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Smartphone, Plus, Wifi, WifiOff, QrCode, Trash2, RefreshCw, Bot, Search } from 'lucide-react';
import { toast } from 'sonner';

type Device = {
  id: string;
  name: string;
  evolution_api_url: string;
  evolution_api_key: string;
  instance_name: string;
  phone_number: string | null;
  status: string;
  qr_code: string | null;
  last_connected_at: string | null;
  created_at: string;
};

const statusConfig: Record<string, { color: string; label: string }> = {
  connected: { color: 'bg-green-500/20 text-green-500', label: 'Conectado' },
  connecting: { color: 'bg-yellow-500/20 text-yellow-500', label: 'Conectando' },
  disconnected: { color: 'bg-red-500/20 text-red-500', label: 'Desconectado' },
  error: { color: 'bg-muted text-muted-foreground', label: 'Erro' },
};

export default function DevicesPage() {
  const user = useAuthStore((s) => s.user);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [manageDevice, setManageDevice] = useState<Device | null>(null);
  const [deleteDevice, setDeleteDevice] = useState<Device | null>(null);
  const [linkedAgents, setLinkedAgents] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', evolution_api_url: '', evolution_api_key: '', instance_name: '' });
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [webhookInfo, setWebhookInfo] = useState<{ current_url: string | null; expected_url: string; is_correct: boolean } | null>(null);
  const [checkingWebhook, setCheckingWebhook] = useState(false);

  const fetchDevices = async () => {
    const { data } = await supabase.from('devices').select('*').order('created_at', { ascending: false });
    setDevices((data as Device[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchDevices(); }, []);

  // Polling for connecting devices
  useEffect(() => {
    if (!manageDevice || manageDevice.status !== 'connecting') return;
    const interval = setInterval(async () => {
      try {
        const res = await supabase.functions.invoke('device-status', {
          body: { device_id: manageDevice.id },
        });
        if (res.data?.status) {
          const updated = { ...manageDevice, ...res.data };
          setManageDevice(updated);
          setDevices(prev => prev.map(d => d.id === updated.id ? updated : d));
          if (res.data.status === 'connected') {
            toast.success('Dispositivo conectado!');
          }
        }
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [manageDevice?.id, manageDevice?.status]);

  // QR refresh every 30s
  useEffect(() => {
    if (!manageDevice || manageDevice.status !== 'connecting') return;
    const interval = setInterval(async () => {
      await connectDevice(manageDevice.id);
    }, 30000);
    return () => clearInterval(interval);
  }, [manageDevice?.id, manageDevice?.status]);

  // Load linked agents when managing a device
  useEffect(() => {
    if (!manageDevice) { setLinkedAgents([]); return; }
    supabase.from('agents').select('id, name, status').eq('device_id', manageDevice.id)
      .then(({ data }) => setLinkedAgents(data ?? []));
  }, [manageDevice?.id]);

  const handleAdd = async () => {
    if (!user) return;
    if (!form.name || !form.evolution_api_url || !form.evolution_api_key || !form.instance_name) {
      toast.error('Preencha todos os campos');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.from('devices').insert({
      user_id: user.id,
      name: form.name,
      evolution_api_url: form.evolution_api_url,
      evolution_api_key: form.evolution_api_key,
      instance_name: form.instance_name,
    }).select().single();

    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Dispositivo adicionado!');
    setAddOpen(false);
    setForm({ name: '', evolution_api_url: '', evolution_api_key: '', instance_name: '' });
    setSaving(false);
    await fetchDevices();
    if (data) {
      setManageDevice(data as Device);
      await connectDevice((data as Device).id);
    }
  };

  const connectDevice = async (deviceId: string) => {
    setConnecting(true);
    try {
      const res = await supabase.functions.invoke('device-connect', {
        body: { device_id: deviceId },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data) {
        setManageDevice(prev => prev ? { ...prev, ...res.data } : prev);
        setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, ...res.data } : d));
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao conectar');
    }
    setConnecting(false);
  };

  const disconnectDevice = async () => {
    if (!manageDevice) return;
    try {
      await supabase.functions.invoke('device-disconnect', {
        body: { device_id: manageDevice.id },
      });
      const updated = { ...manageDevice, status: 'disconnected', phone_number: null, qr_code: null };
      setManageDevice(updated);
      setDevices(prev => prev.map(d => d.id === updated.id ? updated : d));
      toast.success('Dispositivo desconectado');
    } catch (e: any) {
      toast.error(e.message || 'Erro');
    }
  };

  const handleDelete = async () => {
    if (!deleteDevice) return;
    const { error } = await supabase.from('devices').delete().eq('id', deleteDevice.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Dispositivo excluído');
    setDeleteDevice(null);
    setManageDevice(null);
    fetchDevices();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dispositivos</h1>
          <p className="text-muted-foreground">Gerencie suas conexões WhatsApp</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />Adicionar dispositivo
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : devices.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Smartphone className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Nenhum dispositivo</h3>
            <p className="text-muted-foreground mb-4">Adicione seu primeiro WhatsApp</p>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />Adicionar
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {devices.map((d) => {
            const sc = statusConfig[d.status] || statusConfig.disconnected;
            return (
              <Card key={d.id} className="hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => setManageDevice(d)}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">{d.name}</CardTitle>
                  <Badge variant="secondary" className={sc.color}>{sc.label}</Badge>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {d.phone_number || 'Aguardando conexão'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{d.instance_name}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Device Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar dispositivo</DialogTitle>
            <DialogDescription>Configure a conexão com a Evolution API</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do dispositivo</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: WhatsApp Vendas" />
            </div>
            <div className="space-y-2">
              <Label>URL da Evolution API</Label>
              <Input value={form.evolution_api_url} onChange={e => setForm({ ...form, evolution_api_url: e.target.value })}
                placeholder="https://api.evolution.com" />
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input type="password" value={form.evolution_api_key}
                onChange={e => setForm({ ...form, evolution_api_key: e.target.value })}
                placeholder="Sua chave da API" />
            </div>
            <div className="space-y-2">
              <Label>Nome da instância</Label>
              <Input value={form.instance_name} onChange={e => setForm({ ...form, instance_name: e.target.value })}
                placeholder="minha-instancia" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar e conectar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Device Dialog */}
      <Dialog open={!!manageDevice} onOpenChange={(open) => !open && setManageDevice(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{manageDevice?.name}</DialogTitle>
            <DialogDescription>Gerencie este dispositivo</DialogDescription>
          </DialogHeader>
          {manageDevice && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className={statusConfig[manageDevice.status]?.color}>
                  {statusConfig[manageDevice.status]?.label}
                </Badge>
                {manageDevice.phone_number && (
                  <span className="text-sm text-muted-foreground">{manageDevice.phone_number}</span>
                )}
              </div>

              {manageDevice.status === 'connecting' && manageDevice.qr_code && (
                <div className="flex flex-col items-center gap-3 p-4 border rounded-lg bg-white">
                  <QrCode className="h-5 w-5 text-muted-foreground" />
                  <img src={manageDevice.qr_code.startsWith('data:') ? manageDevice.qr_code : `data:image/png;base64,${manageDevice.qr_code}`}
                    alt="QR Code" className="w-64 h-64 object-contain" />
                  <p className="text-xs text-muted-foreground text-center">
                    Abra o WhatsApp → Dispositivos conectados → Escanear QR
                  </p>
                </div>
              )}

              {manageDevice.status === 'connected' && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={disconnectDevice}>
                    <WifiOff className="mr-1 h-3 w-3" />Desconectar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => connectDevice(manageDevice.id)} disabled={connecting}>
                    <RefreshCw className="mr-1 h-3 w-3" />Reconectar
                  </Button>
                </div>
              )}

              {(manageDevice.status === 'disconnected' || manageDevice.status === 'error') && (
                <Button onClick={() => connectDevice(manageDevice.id)} disabled={connecting}>
                  <Wifi className="mr-1 h-4 w-4" />{connecting ? 'Conectando...' : 'Conectar'}
                </Button>
              )}

              {linkedAgents.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Agentes vinculados:</p>
                  {linkedAgents.map(a => (
                    <div key={a.id} className="flex items-center gap-2 text-sm">
                      <Bot className="h-3 w-3 text-muted-foreground" />
                      <span>{a.name}</span>
                      <Badge variant="outline" className="text-xs">{a.status}</Badge>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t pt-3 space-y-2">
                <Button variant="outline" size="sm" disabled={checkingWebhook} onClick={async () => {
                  setCheckingWebhook(true);
                  setWebhookInfo(null);
                  try {
                    const res = await supabase.functions.invoke('check-webhook', { body: { device_id: manageDevice.id } });
                    if (res.data) setWebhookInfo(res.data);
                    else toast.error('Erro ao verificar webhook');
                  } catch { toast.error('Erro ao verificar'); }
                  setCheckingWebhook(false);
                }}>
                  <Search className="mr-1 h-3 w-3" />{checkingWebhook ? 'Verificando...' : 'Verificar webhook'}
                </Button>
                {webhookInfo && (
                  <div className={`text-xs p-2 rounded border ${webhookInfo.is_correct ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                    <p><strong>Status:</strong> {webhookInfo.is_correct ? '✅ Configurado corretamente' : '❌ Incorreto ou ausente'}</p>
                    <p className="truncate"><strong>URL atual:</strong> {webhookInfo.current_url || 'Nenhuma'}</p>
                    {!webhookInfo.is_correct && <p className="truncate"><strong>Esperado:</strong> {webhookInfo.expected_url}</p>}
                    {!webhookInfo.is_correct && (
                      <Button variant="outline" size="sm" className="mt-2 border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10" onClick={async () => {
                        try {
                          toast.info('Corrigindo webhook...');
                          await supabase.functions.invoke('device-connect', { body: { device_id: manageDevice.id } });
                          const res = await supabase.functions.invoke('check-webhook', { body: { device_id: manageDevice.id } });
                          if (res.data) {
                            setWebhookInfo(res.data);
                            if (res.data.is_correct) toast.success('Webhook corrigido!');
                            else toast.error('Webhook ainda incorreto');
                          }
                        } catch { toast.error('Erro ao corrigir webhook'); }
                      }}>
                        <RefreshCw className="mr-1 h-3 w-3" />Corrigir webhook
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <Button variant="destructive" size="sm"
                onClick={() => { setDeleteDevice(manageDevice); setManageDevice(null); }}>
                <Trash2 className="mr-1 h-3 w-3" />Excluir dispositivo
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteDevice} onOpenChange={(open) => !open && setDeleteDevice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir dispositivo?</AlertDialogTitle>
            <AlertDialogDescription>
              O dispositivo será removido e os agentes vinculados serão desvinculados. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
