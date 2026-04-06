import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Plus, Trash2, Upload, ShieldBan } from 'lucide-react';
import Papa from 'papaparse';

interface BlacklistEntry {
  id: string;
  phone: string;
  label: string | null;
  created_at: string;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [name, setName] = useState('');

  // Blacklist state
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [loadingBl, setLoadingBl] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data }) => {
      setProfile(data);
      setName(data?.name || '');
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

  const normalizePhone = (raw: string) => raw.replace(/\D/g, '');

  const handleAddNumber = async () => {
    if (!user || !newPhone.trim()) return;
    setSaving(true);
    const phone = normalizePhone(newPhone);
    const { error } = await supabase.from('blacklist').insert({
      user_id: user.id,
      phone,
      label: newLabel.trim() || null,
    });
    setSaving(false);
    if (error) {
      if (error.code === '23505') toast.error('Número já está na blacklist');
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
    if (!file || !user) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as Record<string, string>[];
        const entries = rows
          .map((r) => {
            const phone = normalizePhone(r.telefone || r.phone || r.numero || '');
            const label = r.label || r.nome || r.name || null;
            return phone ? { user_id: user.id, phone, label } : null;
          })
          .filter(Boolean) as { user_id: string; phone: string; label: string | null }[];

        if (entries.length === 0) {
          toast.error('Nenhum número válido encontrado no CSV');
          return;
        }

        const { error } = await supabase.from('blacklist').upsert(entries, {
          onConflict: 'user_id,phone',
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
                <div className="flex gap-2">
                  <input
                    type="file"
                    accept=".csv"
                    ref={fileRef}
                    onChange={handleCsvImport}
                    className="hidden"
                  />
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
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
                          disabled={!newPhone.trim() || saving}
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
                      <TableHead>Identificação</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blacklist.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono">{entry.phone}</TableCell>
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
