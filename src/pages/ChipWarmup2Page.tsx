import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Flame, Plus, Power, PowerOff, Loader2, Smartphone, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type ChipWarmup = {
  id: string;
  user_id: string;
  provider: string;
  api_url: string;
  instance_name: string | null;
  token: string | null;
  status: string;
  created_at: string;
};

type Device = {
  id: string;
  name: string;
  evolution_api_url: string;
  evolution_api_key: string;
  instance_name: string;
  status: string;
};

export default function ChipWarmup2Page() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<'evolution' | 'uazapi' | 'waha'>('evolution');
  const [deviceId, setDeviceId] = useState<string>('');
  const [apiUrl, setApiUrl] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [token, setToken] = useState('');

  const { data: warmups = [], isLoading } = useQuery({
    queryKey: ['chip-warmups-v2'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chip_warmups')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ChipWarmup[];
    },
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['devices-for-warmup'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('devices')
        .select('id, name, evolution_api_url, evolution_api_key, instance_name, status')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Device[];
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { action: 'connect' };
      if (provider === 'evolution') {
        if (!deviceId) throw new Error('Selecione um dispositivo Evolution');
        payload.device_id = deviceId;
      } else {
        payload.provider = provider;
        payload.url = apiUrl;
        payload.instancia = instanceName;
        payload.token = token;
      }
      const { data, error } = await supabase.functions.invoke('chip-warmup-v2', { body: payload });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success('Chip conectado no Maturador 2!');
      queryClient.invalidateQueries({ queryKey: ['chip-warmups-v2'] });
      setOpen(false);
      resetForm();
    },
    onError: (err: Error) => toast.error('Erro ao conectar', { description: err.message }),
  });

  const disconnectMutation = useMutation({
    mutationFn: async (w: ChipWarmup) => {
      const { data, error } = await supabase.functions.invoke('chip-warmup-v2', {
        body: { action: 'disconnect', url: w.api_url, instancia: w.instance_name },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Chip desconectado!');
      queryClient.invalidateQueries({ queryKey: ['chip-warmups-v2'] });
    },
    onError: (err: Error) => toast.error('Erro ao desconectar', { description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (w: ChipWarmup) => {
      if (w.status === 'connected' && w.api_url && w.instance_name) {
        await supabase.functions.invoke('chip-warmup-v2', {
          body: { action: 'disconnect', url: w.api_url, instancia: w.instance_name },
        });
      }
      const { error } = await supabase.from('chip_warmups').delete().eq('id', w.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Chip removido!');
      queryClient.invalidateQueries({ queryKey: ['chip-warmups-v2'] });
    },
    onError: (err: Error) => toast.error('Erro ao remover', { description: err.message }),
  });

  const resetForm = () => {
    setProvider('evolution');
    setDeviceId('');
    setApiUrl('');
    setInstanceName('');
    setToken('');
  };

  const canSubmit = provider === 'evolution'
    ? !!deviceId
    : !!apiUrl && !!instanceName && !!token;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flame className="h-6 w-6 text-orange-500" />
            Aquecimento 2
          </h1>
          <p className="text-muted-foreground mt-1">
            Maturador Raul — conecte diretamente seu Evolution sem preencher nada
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Conectar Chip</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Conectar Chip — Maturador 2</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Provedor</Label>
                <Select value={provider} onValueChange={(v) => setProvider(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="evolution">Evolution (nativo)</SelectItem>
                    <SelectItem value="uazapi">Uazapi</SelectItem>
                    <SelectItem value="waha">WAHA</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {provider === 'evolution' ? (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Smartphone className="h-3 w-3" /> Dispositivo Evolution
                  </Label>
                  <Select value={deviceId} onValueChange={setDeviceId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um dispositivo" />
                    </SelectTrigger>
                    <SelectContent>
                      {devices.length === 0 ? (
                        <div className="px-2 py-3 text-sm text-muted-foreground">
                          Nenhum dispositivo cadastrado
                        </div>
                      ) : devices.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name} — {d.instance_name} {d.status === 'connected' ? '🟢' : '⚪'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    URL, instância e API key serão usadas automaticamente do dispositivo.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>URL da API *</Label>
                    <Input placeholder="https://sua-api.com" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome da Instância *</Label>
                    <Input placeholder="minha-instancia" value={instanceName} onChange={(e) => setInstanceName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Token *</Label>
                    <Input placeholder="Token de autenticação" value={token} onChange={(e) => setToken(e.target.value)} />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => connectMutation.mutate()} disabled={!canSubmit || connectMutation.isPending}>
                {connectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Conectar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : warmups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Flame className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-lg">Nenhum chip no Maturador 2</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {warmups.map((w) => (
            <Card key={w.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium">{w.instance_name || w.api_url}</CardTitle>
                  <Badge variant={w.status === 'connected' ? 'default' : 'secondary'}>
                    {w.status === 'connected'
                      ? <><Power className="h-3 w-3 mr-1" /> Ativo</>
                      : <><PowerOff className="h-3 w-3 mr-1" /> Inativo</>}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm"><span className="text-muted-foreground">Provedor:</span> <span className="capitalize">{w.provider}</span></div>
                <div className="text-sm truncate"><span className="text-muted-foreground">URL:</span> {w.api_url}</div>
                {w.instance_name && (
                  <div className="text-sm"><span className="text-muted-foreground">Instância:</span> {w.instance_name}</div>
                )}
                <div className="pt-2 flex gap-2">
                  {w.status === 'connected' ? (
                    <Button variant="destructive" size="sm" className="flex-1"
                      disabled={disconnectMutation.isPending}
                      onClick={() => disconnectMutation.mutate(w)}>
                      {disconnectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Desconectar
                    </Button>
                  ) : (
                    <Badge variant="outline" className="flex-1 justify-center">Desconectado</Badge>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" title="Remover">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover este chip?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {w.status === 'connected'
                            ? 'O chip será desconectado do maturador e removido da lista.'
                            : 'O registro será removido da lista.'}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => deleteMutation.mutate(w)}>
                          Remover
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
