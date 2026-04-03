import { useAgentStore } from '@/stores/agentStore';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Headphones, Send, Wifi } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

export function WizardStep1() {
  const { wizardData, updateWizardData } = useAgentStore();
  const [testing, setTesting] = useState(false);

  const testConnection = async () => {
    if (!wizardData.evolution_api_url || !wizardData.evolution_api_key || !wizardData.evolution_instance) {
      toast.error('Preencha todos os campos da Evolution API');
      return;
    }
    setTesting(true);
    try {
      const res = await fetch(
        `${wizardData.evolution_api_url}/instance/connectionState/${wizardData.evolution_instance}`,
        { headers: { apikey: wizardData.evolution_api_key } }
      );
      if (res.ok) {
        const data = await res.json();
        toast.success(`Conexão: ${data?.instance?.state || 'OK'}`);
      } else {
        toast.error('Falha na conexão');
      }
    } catch {
      toast.error('Erro ao conectar com a Evolution API');
    }
    setTesting(false);
  };

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
          <Label>URL da Evolution API</Label>
          <Input value={wizardData.evolution_api_url} onChange={(e) => updateWizardData({ evolution_api_url: e.target.value })} placeholder="https://api.evolution.com" />
        </div>
        <div className="space-y-2">
          <Label>API Key</Label>
          <Input type="password" value={wizardData.evolution_api_key} onChange={(e) => updateWizardData({ evolution_api_key: e.target.value })} placeholder="Sua chave da API" />
        </div>
        <div className="space-y-2">
          <Label>Nome da instância</Label>
          <Input value={wizardData.evolution_instance} onChange={(e) => updateWizardData({ evolution_instance: e.target.value })} placeholder="minha-instancia" />
        </div>
        <Button variant="outline" onClick={testConnection} disabled={testing}>
          <Wifi className="mr-2 h-4 w-4" />
          {testing ? 'Testando...' : 'Testar conexão'}
        </Button>
      </div>
    </div>
  );
}
