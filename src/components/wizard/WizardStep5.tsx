import { useAgentStore } from '@/stores/agentStore';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Shield } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function WizardStep5() {
  const { wizardData, updateWizardData } = useAgentStore();

  const addObjection = () => {
    updateWizardData({
      objection_handlers: [...wizardData.objection_handlers, { objection: '', response: '' }],
    });
  };

  const removeObjection = (i: number) => {
    updateWizardData({
      objection_handlers: wizardData.objection_handlers.filter((_, idx) => idx !== i),
    });
  };

  const updateObjection = (i: number, field: 'objection' | 'response', value: string) => {
    const updated = [...wizardData.objection_handlers];
    updated[i] = { ...updated[i], [field]: value };
    updateWizardData({ objection_handlers: updated });
  };

  return (
    <div className="space-y-6">
      {/* Objeções */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Objeções</Label>
          <Button variant="outline" size="sm" onClick={addObjection}>
            <Plus className="mr-1 h-4 w-4" />Adicionar
          </Button>
        </div>
        {wizardData.objection_handlers.map((obj, i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Input value={obj.objection} onChange={(e) => updateObjection(i, 'objection', e.target.value)} placeholder="Objeção do lead..." className="flex-1" />
                <Button variant="ghost" size="icon" onClick={() => removeObjection(i)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <Textarea value={obj.response} onChange={(e) => updateObjection(i, 'response', e.target.value)} placeholder="Resposta sugerida..." rows={2} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Followup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Followup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Iniciar após mensagem nº</Label>
              <Input type="number" min={1} value={wizardData.followup_start_message} onChange={(e) => updateWizardData({ followup_start_message: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Máximo de followups</Label>
              <Input type="number" min={0} max={5} value={wizardData.followup_max} onChange={(e) => updateWizardData({ followup_max: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Intervalo</Label>
              <Select value={String(wizardData.followup_interval_minutes)} onValueChange={(v) => updateWizardData({ followup_interval_minutes: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">1h</SelectItem>
                  <SelectItem value="120">2h</SelectItem>
                  <SelectItem value="240">4h</SelectItem>
                  <SelectItem value="480">8h</SelectItem>
                  <SelectItem value="1440">24h</SelectItem>
                  <SelectItem value="2880">48h</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Anti-ban */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />Proteção Anti-ban
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Gatilhos de encerramento (edite abaixo):</p>
          <Textarea
            value={wizardData.ban_triggers.join(', ')}
            onChange={(e) => updateWizardData({ ban_triggers: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            rows={2}
            placeholder="para, stop, me tira, não quero..."
          />
        </CardContent>
      </Card>
    </div>
  );
}
