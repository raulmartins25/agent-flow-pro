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
import { Flame, Plus, Power, PowerOff, Loader2 } from 'lucide-react';

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

export default function ChipWarmupPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState('evolution');
  const [apiUrl, setApiUrl] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [token, setToken] = useState('');

  const { data: warmups = [], isLoading } = useQuery({
    queryKey: ['chip-warmups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chip_warmups')
        .select('id, user_id, provider, evolution_url, instance_name, phone_number, status, error_message, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ChipWarmup[];
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('chip-warmup', {
        body: {
          action: 'connect',
          provider,
          url: apiUrl,
          instancia: instanceName || undefined,
          token: token || undefined,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success('Chip conectado para aquecimento!', {
        description: data?.api_response?.message || 'Conexão realizada',
      });
      queryClient.invalidateQueries({ queryKey: ['chip-warmups'] });
      setOpen(false);
      resetForm();
    },
    onError: (err: Error) => {
      toast.error('Erro ao conectar', { description: err.message });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (warmup: ChipWarmup) => {
      const { data, error } = await supabase.functions.invoke('chip-warmup', {
        body: {
          action: 'disconnect',
          url: warmup.api_url,
          instancia: warmup.instance_name || undefined,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success('Chip desconectado!', {
        description: data?.api_response?.message || 'Desconexão realizada',
      });
      queryClient.invalidateQueries({ queryKey: ['chip-warmups'] });
    },
    onError: (err: Error) => {
      toast.error('Erro ao desconectar', { description: err.message });
    },
  });

  const resetForm = () => {
    setProvider('evolution');
    setApiUrl('');
    setInstanceName('');
    setToken('');
  };

  const showInstanceField = provider === 'evolution' || provider === 'waha';
  const showTokenField = provider === 'evolution' || provider === 'waha';
  const tokenLabel = provider === 'evolution' ? 'API Key' : 'Token';
  const tokenRequired = showTokenField;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flame className="h-6 w-6 text-orange-500" />
            Aquecimento de Chip
          </h1>
          <p className="text-muted-foreground mt-1">
            Conecte instâncias WhatsApp para aquecimento antes de usar nos agentes
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Conectar Chip
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Conectar Chip para Aquecimento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Provedor</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="evolution">Evolution API</SelectItem>
                    <SelectItem value="uazapi">Uazapi</SelectItem>
                    <SelectItem value="waha">WAHA</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>URL da API</Label>
                <Input
                  placeholder="https://sua-api.com"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                />
              </div>

              {showInstanceField && (
                <div className="space-y-2">
                  <Label>Nome da Instância</Label>
                  <Input
                    placeholder="minha-instancia"
                    value={instanceName}
                    onChange={(e) => setInstanceName(e.target.value)}
                  />
                </div>
              )}

              {showTokenField && (
                <div className="space-y-2">
                  <Label>{tokenLabel} *</Label>
                  <Input
                    placeholder={provider === 'evolution' ? 'Sua API Key da Evolution' : 'Token de autenticação'}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => connectMutation.mutate()}
                disabled={!apiUrl || (tokenRequired && !token) || connectMutation.isPending}
              >
                {connectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Conectar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : warmups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Flame className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-lg">Nenhum chip em aquecimento</p>
            <p className="text-muted-foreground text-sm mt-1">
              Conecte um chip para começar o aquecimento
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {warmups.map((w) => (
            <Card key={w.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium">
                    {w.instance_name || w.api_url}
                  </CardTitle>
                  <Badge variant={w.status === 'connected' ? 'default' : 'secondary'}>
                    {w.status === 'connected' ? (
                      <><Power className="h-3 w-3 mr-1" /> Ativo</>
                    ) : (
                      <><PowerOff className="h-3 w-3 mr-1" /> Inativo</>
                    )}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm">
                  <span className="text-muted-foreground">Provedor:</span>{' '}
                  <span className="capitalize">{w.provider}</span>
                </div>
                <div className="text-sm truncate">
                  <span className="text-muted-foreground">URL:</span> {w.api_url}
                </div>
                {w.instance_name && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Instância:</span> {w.instance_name}
                  </div>
                )}
                <div className="pt-2">
                  {w.status === 'connected' ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full"
                      disabled={disconnectMutation.isPending}
                      onClick={() => disconnectMutation.mutate(w)}
                    >
                      {disconnectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Desconectar
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={connectMutation.isPending}
                      onClick={() => {
                        setProvider(w.provider);
                        setApiUrl(w.api_url);
                        setInstanceName(w.instance_name || '');
                        setToken(w.token || '');
                        connectMutation.mutate();
                      }}
                    >
                      Reconectar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
