import { useAgentStore } from '@/stores/agentStore';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const tones = [
  { value: 'formal' as const, label: 'Formal', desc: 'Comunicação profissional e direta' },
  { value: 'semi-formal' as const, label: 'Semi-formal', desc: 'Equilíbrio entre profissional e amigável' },
  { value: 'casual' as const, label: 'Descontraído', desc: 'Tom casual e próximo' },
];

export function WizardStep2() {
  const { wizardData, updateWizardData } = useAgentStore();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nome da persona</Label>
          <Input value={wizardData.agent_persona_name} onChange={(e) => updateWizardData({ agent_persona_name: e.target.value })} placeholder="Ex: Sofia, Carlos" />
        </div>
        <div className="space-y-2">
          <Label>Nome da empresa</Label>
          <Input value={wizardData.company_name} onChange={(e) => updateWizardData({ company_name: e.target.value })} placeholder="Sua empresa" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Segmento/nicho</Label>
        <Input value={wizardData.segment} onChange={(e) => updateWizardData({ segment: e.target.value })} placeholder="Ex: Imóveis, Educação, SaaS" />
      </div>

      <div className="space-y-2">
        <Label>Tom de voz</Label>
        <div className="grid grid-cols-3 gap-3">
          {tones.map((t) => (
            <Card
              key={t.value}
              className={`cursor-pointer transition-all ${wizardData.tone === t.value ? 'border-primary ring-2 ring-primary/20' : 'hover:border-primary/30'}`}
              onClick={() => updateWizardData({ tone: t.value })}
            >
              <CardContent className="p-4 text-center">
                <p className="font-medium text-sm">{t.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Descrição do produto/serviço</Label>
        <Textarea value={wizardData.product_service_description} onChange={(e) => updateWizardData({ product_service_description: e.target.value })} placeholder="Descreva brevemente o que você oferece..." maxLength={500} rows={3} />
        <p className="text-xs text-muted-foreground">{wizardData.product_service_description.length}/500</p>
      </div>

      <div className="space-y-2">
        <Label>Restrições da IA</Label>
        <Textarea value={wizardData.ai_restrictions} onChange={(e) => updateWizardData({ ai_restrictions: e.target.value })} placeholder="Ex: Nunca citar concorrentes, nunca dar preços..." rows={3} />
      </div>
    </div>
  );
}
