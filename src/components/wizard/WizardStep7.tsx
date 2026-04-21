import { useEffect, useState } from 'react';
import { useAgentStore } from '@/stores/agentStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ClinicOpt { id: string; name: string; raw: any }
interface SpecialtyOpt { id: string; name: string; raw: any }

function extractList(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.clinics)) return payload.clinics;
  if (Array.isArray(payload?.specialties)) return payload.specialties;
  return [];
}

function asOption(item: any): { id: string; name: string; raw: any } | null {
  if (!item) return null;
  const id = item.id || item._id || item.uuid || item.clinicId || item.specialtyId;
  const name = item.name || item.title || item.label || item.description;
  if (!id) return null;
  const city = item.city || item.address?.city;
  return { id: String(id), name: city ? `${name || id} — ${city}` : (name || String(id)), raw: item };
}

export function WizardStep7() {
  const { wizardData, updateWizardData } = useAgentStore();
  const [clinics, setClinics] = useState<ClinicOpt[]>([]);
  const [specialties, setSpecialties] = useState<SpecialtyOpt[]>([]);
  const [loadingClinics, setLoadingClinics] = useState(false);
  const [loadingSpecs, setLoadingSpecs] = useState(false);

  const fetchClinics = async () => {
    setLoadingClinics(true);
    setClinics([]);
    try {
      const { data, error } = await supabase.functions.invoke('ecuro-list-clinics', {
        body: {},
        method: 'GET' as any,
      } as any);
      // Some setups need direct fetch via URL params; fallback:
      let payload = data;
      if (error || !data) {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ecuro-list-clinics?env=${wizardData.ecuro_environment}`;
        const r = await fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } });
        payload = await r.json();
      }
      const raw = payload?.clinics ?? payload;
      const list = extractList(raw).map(asOption).filter(Boolean) as ClinicOpt[];
      setClinics(list);
      if (list.length === 0) toast.warning('Nenhuma clínica retornada pela Ecuro');
    } catch (e: any) {
      toast.error('Erro ao buscar clínicas: ' + (e.message || e));
    } finally {
      setLoadingClinics(false);
    }
  };

  const fetchSpecialties = async (clinicId: string) => {
    if (!clinicId) return;
    setLoadingSpecs(true);
    setSpecialties([]);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ecuro-list-specialties?env=${wizardData.ecuro_environment}&clinicId=${encodeURIComponent(clinicId)}`;
      const r = await fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } });
      const payload = await r.json();
      const raw = payload?.specialties ?? payload;
      const list = extractList(raw).map(asOption).filter(Boolean) as SpecialtyOpt[];
      setSpecialties(list);
      if (list.length === 0) toast.warning('Nenhuma especialidade encontrada');
    } catch (e: any) {
      toast.error('Erro ao buscar especialidades: ' + (e.message || e));
    } finally {
      setLoadingSpecs(false);
    }
  };

  useEffect(() => {
    if (wizardData.ecuro_enabled && clinics.length === 0) {
      fetchClinics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardData.ecuro_enabled, wizardData.ecuro_environment]);

  useEffect(() => {
    if (wizardData.ecuro_enabled && wizardData.ecuro_clinic_id && specialties.length === 0) {
      fetchSpecialties(wizardData.ecuro_clinic_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardData.ecuro_clinic_id, wizardData.ecuro_environment]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Integrações</h3>
        <p className="text-sm text-muted-foreground">Conecte sistemas externos para automatizar agendamentos.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Agendamento Ecuro</CardTitle>
            <Switch
              checked={wizardData.ecuro_enabled}
              onCheckedChange={(v) => updateWizardData({ ecuro_enabled: v })}
            />
          </div>
        </CardHeader>
        {wizardData.ecuro_enabled && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Ambiente Ecuro</Label>
                <Select
                  value={wizardData.ecuro_environment}
                  onValueChange={(v: 'dev' | 'prod') => {
                    updateWizardData({
                      ecuro_environment: v,
                      ecuro_clinic_id: '', ecuro_clinic_name: '',
                      ecuro_specialty_id: '', ecuro_specialty_name: '',
                    });
                    setClinics([]); setSpecialties([]);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dev">Teste (dev)</SelectItem>
                    <SelectItem value="prod">Produção</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Duração padrão (minutos)</Label>
                <Input
                  type="number"
                  min={5}
                  max={240}
                  value={wizardData.ecuro_default_duration}
                  onChange={(e) => updateWizardData({ ecuro_default_duration: parseInt(e.target.value) || 30 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Clínica</Label>
                <Button variant="ghost" size="sm" onClick={fetchClinics} disabled={loadingClinics}>
                  {loadingClinics ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                </Button>
              </div>
              <Select
                value={wizardData.ecuro_clinic_id}
                onValueChange={(v) => {
                  const c = clinics.find((x) => x.id === v);
                  updateWizardData({
                    ecuro_clinic_id: v,
                    ecuro_clinic_name: c?.name || '',
                    ecuro_specialty_id: '', ecuro_specialty_name: '',
                  });
                  setSpecialties([]);
                  fetchSpecialties(v);
                }}
                disabled={loadingClinics || clinics.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingClinics ? 'Carregando...' : 'Selecione a clínica'} />
                </SelectTrigger>
                <SelectContent>
                  {clinics.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!loadingClinics && clinics.length === 0 && wizardData.ecuro_enabled && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Nenhuma clínica carregada. Clique em atualizar.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Especialidade padrão</Label>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => fetchSpecialties(wizardData.ecuro_clinic_id)}
                  disabled={loadingSpecs || !wizardData.ecuro_clinic_id}
                >
                  {loadingSpecs ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                </Button>
              </div>
              <Select
                value={wizardData.ecuro_specialty_id}
                onValueChange={(v) => {
                  const s = specialties.find((x) => x.id === v);
                  updateWizardData({ ecuro_specialty_id: v, ecuro_specialty_name: s?.name || '' });
                }}
                disabled={!wizardData.ecuro_clinic_id || loadingSpecs || specialties.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={!wizardData.ecuro_clinic_id ? 'Selecione uma clínica primeiro' : (loadingSpecs ? 'Carregando...' : 'Selecione a especialidade')} />
                </SelectTrigger>
                <SelectContent>
                  {specialties.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {wizardData.ecuro_clinic_id && wizardData.ecuro_specialty_id && (
              <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
                <p className="flex items-center gap-1 text-primary">
                  <CheckCircle2 className="h-3 w-3" /> Configuração pronta
                </p>
                <p><strong>Clínica:</strong> {wizardData.ecuro_clinic_name}</p>
                <p><strong>Especialidade:</strong> {wizardData.ecuro_specialty_name}</p>
                <p><strong>Ambiente:</strong> {wizardData.ecuro_environment === 'prod' ? 'Produção' : 'Teste (dev)'}</p>
                <p className="text-muted-foreground italic mt-2">A IA usará essas configurações para verificar disponibilidade e criar agendamentos automaticamente.</p>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
