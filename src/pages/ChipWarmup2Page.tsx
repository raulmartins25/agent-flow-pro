import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Flame, Plus, Power, PowerOff, Loader2, Smartphone, Trash2, Server, RefreshCw } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAuthStore } from '@/stores/authStore';

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
  instance_name: string;
  status: string;
};

type WarmupServer = {
  id: string;
  label: string;
  evolution_api_url: string;
  evolution_api_key: string;
};

type RemoteInstance = {
  name: string;
  status: string | null;
  number: string | null;
  profileName: string | null;
  token: string | null;
};

export default function ChipWarmup2Page() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  // Connect dialog
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<'evolution' | 'uazapi' | 'waha'>('evolution');
  const [evoSource, setEvoSource] = useState<'device' | 'server'>('device');
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [selectedServerId, setSelectedServerId] = useState('');
  const [remoteInstances, setRemoteInstances] = useState<RemoteInstance[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [selectedRemote, setSelectedRemote] = useState<Set<string>>(new Set());

  const [apiUrl, setApiUrl] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [token, setToken] = useState('');

  // Servers manager
  const [manageOpen, setManageOpen] = useState(false);
  const [addServerOpen, setAddServerOpen] = useState(false);
  const [srvLabel, setSrvLabel] = useState('');
  const [srvUrl, setSrvUrl] = useState('');
  const [srvKey, setSrvKey] = useState('');

  const { data: warmups = [], isLoading } = useQuery({
    queryKey: ['chip-warmups-v2'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chip_warmups').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as ChipWarmup[];
    },
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['devices-for-warmup'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('devices')
        .select('id, name, instance_name, status')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Device[];
    },
  });

  const { data: servers = [] } = useQuery({
    queryKey: ['warmup-evolution-servers'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('warmup_evolution_servers')
        .select('id, label, evolution_api_url, evolution_api_key')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as WarmupServer[];
    },
  });

  const fetchRemoteInstances = async (serverId: string) => {
    if (!serverId) return;
    setLoadingRemote(true);
    setRemoteInstances([]);
    setSelectedRemote(new Set());
    try {
      const { data, error } = await supabase.functions.invoke('warmup-evolution-list', {
        body: { server_id: serverId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setRemoteInstances(((data as any)?.instances ?? []) as RemoteInstance[]);
    } catch (err) {
      toast.error('Erro ao listar instâncias', { description: (err as Error).message });
    } finally {
      setLoadingRemote(false);
    }
  };

  const connectMutation = useMutation({
    mutationFn: async () => {
      if (provider === 'evolution') {
        if (evoSource === 'device') {
          if (!selectedDeviceId) throw new Error('Selecione um dispositivo');
          const { data, error } = await supabase.functions.invoke('chip-warmup-v2', {
            body: { action: 'connect', device_id: selectedDeviceId },
          });
          if (error) throw error;
          if ((data as any)?.error) throw new Error((data as any).error);
          return 1;
        }
        // server: connect each selected remote instance
        const server = servers.find((s) => s.id === selectedServerId);
        if (!server) throw new Error('Selecione um servidor Evolution');
        if (selectedRemote.size === 0) throw new Error('Selecione ao menos uma instância');
        let ok = 0;
        let already = 0;
        const errors: string[] = [];
        for (const name of selectedRemote) {
          const inst = remoteInstances.find((i) => i.name === name);
          const tokenForInst = inst?.token || server.evolution_api_key;
          const { data, error } = await supabase.functions.invoke('chip-warmup-v2', {
            body: {
              action: 'connect',
              provider: 'evolution',
              url: server.evolution_api_url,
              instancia: name,
              token: tokenForInst,
            },
          });
          const errMsg = error?.message ?? (data as any)?.error;
          const apiResp = JSON.stringify((data as any)?.api_response ?? '').toLowerCase();
          const isAlready =
            (data as any)?.already_connected ||
            apiResp.includes('ja esta conectada') ||
            apiResp.includes('já está conectada');
          if (isAlready) { already++; ok++; }
          else if (errMsg) errors.push(`${name}: ${errMsg}`);
          else ok++;
        }
        if (errors.length) {
          const msg = `${ok} conectado(s)${already ? ` (${already} já estava(m))` : ''}. Falhas: ${errors.join(' | ')}`;
          throw new Error(msg);
        }
        return ok;
      }
      const { data, error } = await supabase.functions.invoke('chip-warmup-v2', {
        body: {
          action: 'connect',
          provider, url: apiUrl, instancia: instanceName, token,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return 1;
    },
    onSuccess: (count) => {
      toast.success(`${count} chip(s) conectado(s) no Maturador 2!`);
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

  const addServerMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Sessão expirada');
      const { error } = await (supabase as any).from('warmup_evolution_servers').insert({
        user_id: user.id,
        label: srvLabel.trim(),
        evolution_api_url: srvUrl.trim().replace(/\/+$/, ''),
        evolution_api_key: srvKey.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Servidor Evolution cadastrado!');
      queryClient.invalidateQueries({ queryKey: ['warmup-evolution-servers'] });
      setAddServerOpen(false);
      setSrvLabel(''); setSrvUrl(''); setSrvKey('');
    },
    onError: (err: Error) => toast.error('Erro ao cadastrar', { description: err.message }),
  });

  const deleteServerMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('warmup_evolution_servers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Servidor removido');
      queryClient.invalidateQueries({ queryKey: ['warmup-evolution-servers'] });
    },
    onError: (err: Error) => toast.error('Erro ao remover', { description: err.message }),
  });

  const resetForm = () => {
    setProvider('evolution');
    setEvoSource('device');
    setSelectedDeviceId('');
    setSelectedServerId('');
    setRemoteInstances([]);
    setSelectedRemote(new Set());
    setApiUrl(''); setInstanceName(''); setToken('');
  };

  const toggleRemote = (name: string) => {
    setSelectedRemote((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const alreadyConnectedNames = new Set(
    warmups.filter((w) => w.status === 'connected').map((w) => w.instance_name),
  );

  const canSubmit = provider === 'evolution'
    ? (evoSource === 'device' ? !!selectedDeviceId : selectedRemote.size > 0)
    : !!apiUrl && !!instanceName && !!token;

  const canAddServer = !!srvLabel.trim() && !!srvUrl.trim() && !!srvKey.trim();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flame className="h-6 w-6 text-orange-500" />
            Aquecimento 2
          </h1>
          <p className="text-muted-foreground mt-1">
            Maturador Raul — escolha seus dispositivos ou conecte um servidor Evolution e selecione da lista
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setManageOpen(true)}>
            <Server className="h-4 w-4 mr-2" />
            Servidores Evolution
          </Button>

          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Conectar Chip</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
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
                  <>
                    <div className="space-y-2">
                      <Label>Origem</Label>
                      <Select value={evoSource} onValueChange={(v) => setEvoSource(v as any)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="device">Meus Dispositivos (Agentes)</SelectItem>
                          <SelectItem value="server">Servidor Evolution (lista de instâncias)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {evoSource === 'device' ? (
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                          <Smartphone className="h-3 w-3" /> Dispositivo
                        </Label>
                        <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
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
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1">
                            <Server className="h-3 w-3" /> Servidor Evolution
                          </Label>
                          <div className="flex gap-2">
                            <Select
                              value={selectedServerId}
                              onValueChange={(v) => { setSelectedServerId(v); fetchRemoteInstances(v); }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={servers.length ? 'Selecione um servidor' : 'Nenhum servidor cadastrado'} />
                              </SelectTrigger>
                              <SelectContent>
                                {servers.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.label} — {s.evolution_api_url}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              variant="outline" size="icon" title="Recarregar lista"
                              disabled={!selectedServerId || loadingRemote}
                              onClick={() => fetchRemoteInstances(selectedServerId)}
                            >
                              {loadingRemote ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            </Button>
                          </div>
                          {servers.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                              Cadastre um servidor em "Servidores Evolution" (URL + API key global).
                            </p>
                          )}
                        </div>

                        {selectedServerId && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label>Instâncias disponíveis</Label>
                              {remoteInstances.length > 0 && (
                                <button
                                  type="button"
                                  className="text-xs text-primary hover:underline"
                                  onClick={() => {
                                    const selectable = remoteInstances
                                      .filter((i) => !alreadyConnectedNames.has(i.name))
                                      .map((i) => i.name);
                                    setSelectedRemote(
                                      selectedRemote.size === selectable.length ? new Set() : new Set(selectable),
                                    );
                                  }}
                                >
                                  {selectedRemote.size === remoteInstances.filter((i) => !alreadyConnectedNames.has(i.name)).length
                                    ? 'Desmarcar todos' : 'Selecionar todos'}
                                </button>
                              )}
                            </div>
                            <div className="border rounded-md max-h-64 overflow-y-auto divide-y">
                              {loadingRemote ? (
                                <div className="flex justify-center py-6">
                                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                </div>
                              ) : remoteInstances.length === 0 ? (
                                <div className="text-center text-sm text-muted-foreground py-6">
                                  Nenhuma instância encontrada neste servidor.
                                </div>
                              ) : remoteInstances.map((inst) => {
                                const already = alreadyConnectedNames.has(inst.name);
                                return (
                                  <label
                                    key={inst.name}
                                    className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/40 ${already ? 'opacity-60' : ''}`}
                                  >
                                    <Checkbox
                                      checked={selectedRemote.has(inst.name)}
                                      disabled={already}
                                      onCheckedChange={() => toggleRemote(inst.name)}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium truncate">{inst.name}</div>
                                      <div className="text-xs text-muted-foreground truncate">
                                        {inst.profileName ? `${inst.profileName} · ` : ''}
                                        {inst.number ?? 'sem número'}
                                      </div>
                                    </div>
                                    {already ? (
                                      <Badge variant="secondary" className="text-xs">já no maturador</Badge>
                                    ) : inst.status ? (
                                      <Badge variant="outline" className="text-xs capitalize">{inst.status}</Badge>
                                    ) : null}
                                  </label>
                                );
                              })}
                            </div>
                            {selectedRemote.size > 0 && (
                              <p className="text-xs text-muted-foreground">
                                {selectedRemote.size} instância(s) selecionada(s)
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </>
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
                  Conectar{provider === 'evolution' && evoSource === 'server' && selectedRemote.size > 1 ? ` (${selectedRemote.size})` : ''}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Manage Servers */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" /> Servidores Evolution
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Cadastre 1 ou mais servidores Evolution (URL + API key global). Depois, ao conectar chip, basta escolher o servidor — a lista de instâncias é puxada automaticamente. <b>Não afeta Dispositivos nem agentes.</b>
            </p>

            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAddServerOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Adicionar Servidor
              </Button>
            </div>

            {servers.length === 0 ? (
              <div className="border rounded-md p-6 text-center text-muted-foreground text-sm">
                Nenhum servidor cadastrado.
              </div>
            ) : (
              <div className="border rounded-md divide-y">
                {servers.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3">
                    <div className="min-w-0">
                      <div className="font-medium">{s.label}</div>
                      <div className="text-xs text-muted-foreground truncate">{s.evolution_api_url}</div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover "{s.label}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            O servidor sai da lista. Chips já enviados ao maturador continuam ativos até serem desconectados.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteServerMutation.mutate(s.id)}>
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Server */}
      <Dialog open={addServerOpen} onOpenChange={setAddServerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Servidor Evolution</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Apelido *</Label>
              <Input placeholder="Ex: Evolution Aquecimento" value={srvLabel} onChange={(e) => setSrvLabel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>URL da Evolution *</Label>
              <Input placeholder="https://sua-evolution.com" value={srvUrl} onChange={(e) => setSrvUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>API Key Global *</Label>
              <Input placeholder="API key global do servidor" value={srvKey} onChange={(e) => setSrvKey(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Usada para listar todas as instâncias do servidor.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddServerOpen(false)}>Cancelar</Button>
            <Button onClick={() => addServerMutation.mutate()} disabled={!canAddServer || addServerMutation.isPending}>
              {addServerMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
