import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

type ParsedContact = {
  phone: string;
  name: string;
  formatted: string;
  valid: boolean;
  error?: string;
  custom_vars?: Record<string, any>;
};

function formatBRPhone(raw: string): { formatted: string; valid: boolean; error?: string } {
  let digits = raw.replace(/\D/g, '');

  // Remove leading + if present
  if (digits.startsWith('0')) digits = digits.slice(1);

  // Add country code if missing
  if (digits.length === 10) {
    // 10 digits (DDD + 8 digits) → add 9 after DDD and country code
    digits = '55' + digits.slice(0, 2) + '9' + digits.slice(2);
  } else if (digits.length === 11) {
    // 11 digits (DDD + 9 + 8 digits) → add country code
    digits = '55' + digits;
  } else if (digits.length === 12 && digits.startsWith('55')) {
    // 55 + DDD + 8 digits → add 9 after DDD
    digits = digits.slice(0, 4) + '9' + digits.slice(4);
  }
  // 13 digits starting with 55 → already formatted

  if (digits.length !== 13 || !digits.startsWith('55')) {
    return { formatted: digits, valid: false, error: 'Formato inválido' };
  }

  return { formatted: digits + '@s.whatsapp.net', valid: true };
}

export default function NewBlastPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [contacts, setContacts] = useState<ParsedContact[]>([]);
  const [batchSize, setBatchSize] = useState('10');
  const [intervalSeconds, setIntervalSeconds] = useState('45');
  const [saving, setSaving] = useState(false);
  const [blastPreview, setBlastPreview] = useState('');

  useEffect(() => {
    supabase.from('agents').select('id, name, type').eq('type', 'prospecting').then(({ data }) => {
      setAgents(data ?? []);
    });
  }, []);

  // Fetch blast message when agent is selected
  useEffect(() => {
    if (!selectedAgent) { setBlastPreview(''); return; }
    supabase.from('agent_config').select('first_prospecting_message').eq('agent_id', selectedAgent).single().then(({ data }) => {
      setBlastPreview(data?.first_prospecting_message || '');
    });
  }, [selectedAgent]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          processData(results.data as Record<string, string>[]);
        },
      });
    } else if (ext === 'xls' || ext === 'xlsx') {
      const reader = new FileReader();
      reader.onload = (event) => {
        const wb = XLSX.read(event.target?.result, { type: 'binary' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet) as Record<string, string>[];
        processData(data);
      };
      reader.readAsBinaryString(file);
    } else {
      toast.error('Formato não suportado. Use CSV ou XLS/XLSX.');
    }
  };

  const processData = (data: Record<string, string>[]) => {
    const parsed: ParsedContact[] = data.map(row => {
      // Find phone column (flexible naming)
      const phoneKey = Object.keys(row).find(k =>
        /phone|telefone|celular|whatsapp|numero|número|fone/i.test(k)
      );
      const nameKey = Object.keys(row).find(k =>
        /name|nome/i.test(k)
      );

      const rawPhone = phoneKey ? String(row[phoneKey] || '') : '';
      const name = nameKey ? String(row[nameKey] || '') : '';

      if (!rawPhone) {
        return { phone: '', name, formatted: '', valid: false, error: 'Telefone vazio' };
      }

      const { formatted, valid, error } = formatBRPhone(rawPhone);

      // Collect custom vars (everything except phone and name)
      const customVars: Record<string, any> = {};
      for (const [key, val] of Object.entries(row)) {
        if (key !== phoneKey && key !== nameKey) {
          customVars[key] = val;
        }
      }

      return { phone: rawPhone, name, formatted, valid, error, custom_vars: Object.keys(customVars).length ? customVars : undefined };
    });

    setContacts(parsed);
    const validCount = parsed.filter(c => c.valid).length;
    toast.success(`${parsed.length} contatos importados, ${validCount} válidos`);
  };

  const handleCreate = async () => {
    if (!user || !selectedAgent || !campaignName) {
      toast.error('Preencha todos os campos');
      return;
    }
    const validContacts = contacts.filter(c => c.valid);
    if (validContacts.length === 0) {
      toast.error('Nenhum contato válido');
      return;
    }

    setSaving(true);

    const { data: campaign, error: campError } = await supabase
      .from('blast_campaigns')
      .insert({
        agent_id: selectedAgent,
        user_id: user.id,
        name: campaignName,
        total_contacts: validContacts.length,
        batch_size: parseInt(batchSize),
        interval_seconds: parseInt(intervalSeconds),
      })
      .select()
      .single();

    if (campError) { toast.error(campError.message); setSaving(false); return; }

    const contactRows = validContacts.map(c => ({
      campaign_id: campaign.id,
      phone: c.formatted,
      name: c.name,
      custom_vars: c.custom_vars || null,
    }));

    const { error: contactsError } = await supabase.from('blast_contacts').insert(contactRows);

    if (contactsError) { toast.error(contactsError.message); setSaving(false); return; }

    toast.success('Campanha criada!');
    navigate(`/blasts/${campaign.id}`);
    setSaving(false);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Nova Campanha</h1>
        <p className="text-muted-foreground">Configure e lance seu disparo em massa</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Configuração</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Agente de prospecção</Label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {agents.length === 0 && (
                <p className="text-xs text-destructive">Nenhum agente de prospecção encontrado</p>
              )}
            </div>
          </div>

          {blastPreview && (
            <div className="space-y-2 border-t pt-4">
              <Label className="text-sm font-medium">Mensagem que será enviada para cada contato:</Label>
              <div className="rounded-xl bg-muted/50 p-4">
                <div className="max-w-xs ml-auto">
                  <div className="rounded-lg bg-blue-500/20 px-4 py-2 text-sm">
                    {blastPreview.replace('{{nome_contato}}', 'João').replace('{{nome_agente}}', '').replace('{{empresa}}', '')}
                  </div>
                  <p className="text-xs text-muted-foreground text-right mt-1">Enviado por você (disparo)</p>
                </div>
              </div>
              <p className="text-xs text-amber-400">
                ⚡ Após a resposta do lead, o agente assumirá a conversa automaticamente.
              </p>
            </div>
          )}
            <div className="space-y-2">
              <Label>Nome da campanha</Label>
              <Input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="Ex: Campanha Janeiro" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tamanho do lote</Label>
              <Select value={batchSize} onValueChange={setBatchSize}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['5', '10', '20', '50'].map(v => <SelectItem key={v} value={v}>{v} contatos</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Intervalo entre mensagens</Label>
              <Select value={intervalSeconds} onValueChange={setIntervalSeconds}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[['15', '15s'], ['30', '30s'], ['45', '45s'], ['60', '1min'], ['90', '1m30s'], ['120', '2min']].map(([v, l]) =>
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Lista de contatos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer border border-dashed rounded-lg px-4 py-3 hover:bg-muted/50 transition-colors">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Upload CSV ou XLS</span>
              <input type="file" accept=".csv,.xls,.xlsx" onChange={handleFileUpload} className="hidden" />
            </label>
            {contacts.length > 0 && (
              <div className="text-sm">
                <span className="font-medium">{contacts.length}</span> contatos •{' '}
                <span className="text-primary">{contacts.filter(c => c.valid).length} válidos</span> •{' '}
                <span className="text-destructive">{contacts.filter(c => !c.valid).length} inválidos</span>
              </div>
            )}
          </div>

          {contacts.length > 0 && (
            <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone original</TableHead>
                    <TableHead>Formatado</TableHead>
                    <TableHead className="w-20">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.slice(0, 50).map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{i + 1}</TableCell>
                      <TableCell className="text-xs">{c.name}</TableCell>
                      <TableCell className="text-xs font-mono">{c.phone}</TableCell>
                      <TableCell className="text-xs font-mono">{c.formatted}</TableCell>
                      <TableCell>
                        {c.valid ? (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        ) : (
                          <span className="flex items-center gap-1">
                            <AlertCircle className="h-4 w-4 text-destructive" />
                            <span className="text-xs text-destructive">{c.error}</span>
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {contacts.length > 50 && (
                <p className="text-xs text-muted-foreground p-2 text-center">
                  Mostrando 50 de {contacts.length} contatos
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate('/blasts')}>Cancelar</Button>
        <Button onClick={handleCreate} disabled={saving || !selectedAgent || !campaignName || contacts.filter(c => c.valid).length === 0}>
          {saving ? 'Criando...' : 'Criar campanha'}
        </Button>
      </div>
    </div>
  );
}
