import { useAgentStore } from '@/stores/agentStore';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Headphones, Send, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';

type Device = {
  id: string;
  name: string;
  phone_number: string | null;
  status: string;
};

export function WizardStep1() {
  const { wizardData, updateWizardData } = useAgentStore();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('devices')
      .select('id, name, phone_number, status')
      .eq('status', 'connected')
      .then(({ data }) => {
        setDevices((data as Device[]) ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Card
          className={`cursor-pointer transition-all ${wizardData.type === 'receptive' ? 'border-primary ring-2 ring-primary/20' : 'hover:border-primary/30'}`}
          onClick={() => updateWizardData({ type: 'receptive' })}
        >
          <CardContent className="flex flex-col items-center p-6 text-center">
            <Headphones className="h-10 w-10 text-primary mb-3" />
            <h3 className="font-semibold">Receptivo</h3>
            <p className="text-xs text-muted-foreground mt-1">Responde leads que entram em contato</p>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-all ${wizardData.type === 'prospecting' ? 'border-primary ring-2 ring-primary/20' : 'hover:border-primary/30'}`}
          onClick={() => updateWizardData({ type: 'prospecting' })}
        >
          <CardContent className="flex flex-col items-center p-6 text-center">
            <Send className="h-10 w-10 text-primary mb-3" />
            <h3 className="font-semibold">Prospecção</h3>
            <p className="text-xs text-muted-foreground mt-1">Aborda contatos de uma lista fria</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Nome do agente</Label>
          <Input value={wizardData.name} onChange={(e) => updateWizardData({ name: e.target.value })} placeholder="Ex: Agente de Vendas" />
        </div>

        <div className="space-y-2">
          <Label>Dispositivo WhatsApp</Label>
          {loading ? (
            <div className="h-10 flex items-center text-sm text-muted-foreground">Carregando dispositivos...</div>
          ) : devices.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center space-y-2">
              <Smartphone className="h-6 w-6 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhum dispositivo conectado.</p>
              <Link to="/devices" className="text-sm text-primary hover:underline">
                Adicione um dispositivo primeiro →
              </Link>
            </div>
          ) : (
            <Select
              value={wizardData.device_id}
              onValueChange={(val) => updateWizardData({ device_id: val })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um dispositivo" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} {d.phone_number ? `(${d.phone_number})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
    </div>
  );
}
