import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Plus, Trash2, Upload, ShieldBan } from 'lucide-react';
import Papa from 'papaparse';

interface BlacklistEntry {
  id: string;
  phone: string;
  label: string | null;
  device_id: string | null;
  created_at: string;
}

interface Device {
  id: string;
  name: string;
  instance_name: string;
}

/** Normalize BR phone to canonical 13-digit format: 55 + 2-digit DDD + 9 + 8 digits */
function canonicalPhone(raw: string): string {
  let digits = raw.replace(/@.*$/, '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length === 12) {
    digits = digits.slice(0, 4) + '9' + digits.slice(4);
  }
  return digits;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [name, setName] = useState('');

  // Devices
  const [devices, setDevices] = useState<Device[]>([]);

  // Blacklist state
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [loadingBl, setLoadingBl] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newDeviceId, setNewDeviceId] = useState('');
  const [csvDeviceId, setCsvDeviceId] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data }) => {
      setProfile(data);
      setName(data?.name || '');
    });
    supabase.from('devices').select('id, name, instance_name').eq('user_id', user.id).then(({ data }) => {
      setDevices(data || []);
    });
  }, [user]);

  const loadBlacklist = async () => {
    if (!user) return;
    setLoadingBl(true);
    const { data } = await supabase
      .from('blacklist')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setBlacklist((data as BlacklistEntry[]) || []);
    setLoadingBl(false);
  };

  useEffect(() => { loadBlacklist(); }, [user]);

  const handleSave = async () => {
    if (!user) return;
    const { error } = await supabase.from('profiles').update({ name }).eq('id', user.id);
    if (error) toast.error(error.message);
    else toast.success('Perfil atualizado!');
  };

  const handleAddNumber = async () => {
    if (!user || !newPhone.trim() || !newDeviceId) return;
    setSaving(true);
    const phone = canonicalPhone(newPhone);
    const { error } = await supabase.from('blacklist').insert({
      user_id: user.id,
      phone,
      label: newLabel.trim() || null,
      device_id: newDeviceId,
    });
    setSaving(false);
    if (error) {
      if (error.code === '23505') toast.error('Número já está na blacklist para este dispositivo');
      else toast.error(error.message);
      return;
    }
    toast.success('Número adicionado à blacklist');
    setNewPhone('');
    setNewLabel('');
    setAddOpen(false);
    loadBlacklist();
  };

  const handleRemove = async (id: string) => {
    const { error } = await supabase.from('blacklist').delete().eq('id', id);
    if (error) toast.error(error.message);
    else {
      toast.success('Número removido da blacklist');
      loadBlacklist();
    }
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !csvDeviceId) {
      if (!csvDeviceId) toast.error('Selecione um dispositivo antes de importar');
      return;
    }
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as Record<string, string>[];
        const entries = rows
          .map((r) => {
            const phone = canonicalPhone(r.telefone || r.phone || r.numero || '');
            const label = r.label || r.nome || r.name || null;
            return phone ? { user_id: user.id, phone, label, device_id: csvDeviceId } : null;
          })
          .filter(Boolean) as { user_id: string; phone: string; label: string | null; device_id: string }[];

        if (entries.length === 0) {
          toast.error('Nenhum número válido encontrado no CSV');
          return;
        }

        const { error } = await supabase.from('blacklist').upsert(entries, {
          onConflict: 'user_id,device_id,phone',
          ignoreDuplicates: true,
        });

        if (error) toast.error(error.message);
        else {
          toast.success(`${entries.length} números importados para a blacklist`);
          loadBlacklist();
        }
      },
    });
    e.target.value = '';
  };

  const getDeviceName = (deviceId: string | null) => {
    if (!deviceId) return '—';
    const d = devices.find((dev) => dev.id === deviceId);
    return d ? d.name : deviceId.slice(0, 8);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Perfil</TabsTrigger>
          <TabsTrigger value="plan">Plano</TabsTrigger>
          <TabsTrigger value="blacklist">Blacklist</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Perfil</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user?.email || ''} disabled />
              </div>
              <Button onClick={handleSave}>Salvar</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plan">
          <Card>
            <CardHeader><CardTitle>Plano atual</CardTitle></CardHeader>
            <CardContent>
              <Badge variant="secondary" className="text-lg px-4 py-2">{profile?.plan || 'free'}</Badge>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blacklist" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldBan className="h-5 w-5" /> Números bloqueados
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Estes números nunca serão contactados pela IA nem receberão disparos.
                  </p>
                </div>
                <div className="flex gap-2 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Dispositivo (CSV)</Label>
                    <Select value={csvDeviceId} onValueChange={setCsvDeviceId}>
                      <SelectTrigger className="w-[160px] h-8 text-xs">
                        <SelectValue placeholder="Selecionar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {devices.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <input
                    type="file"
                    accept=".csv"
                    ref={fileRef}
                    onChange={handleCsvImport}
                    className="hidden"
                  />
                  <Button variant="outline" size="sm" onClick={() => {
                    if (!csvDeviceId) { toast.error('Selecione um dispositivo antes de importar'); return; }
                    fileRef.current?.click();
                  }}>
                    <Upload className="h-4 w-4 mr-1" /> Importar CSV
                  </Button>
                  <Dialog open={addOpen} onOpenChange={setAddOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Adicionar número à blacklist</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        <div className="space-y-2">
                          <Label>Dispositivo *</Label>
                          <Select value={newDeviceId} onValueChange={setNewDeviceId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o dispositivo" />
                            </SelectTrigger>
                            <SelectContent>
                              {devices.map((d) => (
                                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Número *</Label>
                          <Input
                            placeholder="5511999999999"
                            value={newPhone}
                            onChange={(e) => setNewPhone(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Identificação (opcional)</Label>
                          <Input
                            placeholder="Ex: Equipe interna, Fornecedor"
                            value={newLabel}
                            onChange={(e) => setNewLabel(e.target.value)}
                          />
                        </div>
                        <Button
                          onClick={handleAddNumber}
                          disabled={!newPhone.trim() || !newDeviceId || saving}
                          className="w-full"
                        >
                          {saving ? 'Salvando...' : 'Salvar'}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {blacklist.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum número bloqueado ainda
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Dispositivo</TableHead>
                      <TableHead>Identificação</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blacklist.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono">{entry.phone}</TableCell>
                        <TableCell>{getDeviceName(entry.device_id)}</TableCell>
                        <TableCell>{entry.label || '—'}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(entry.created_at).toLocaleDateString('pt-BR')}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemove(entry.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
