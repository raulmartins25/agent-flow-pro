import { useAgentStore } from '@/stores/agentStore';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Zap, DollarSign } from 'lucide-react';

const llmOptions = [
  { provider: 'claude' as const, model: 'claude-sonnet-4-20250514', name: 'Claude Sonnet', desc: 'Melhor qualidade', speed: '⚡⚡', quality: '⭐⭐⭐⭐⭐', cost: '$$' },
  { provider: 'claude' as const, model: 'claude-haiku-4-5-20251001', name: 'Claude Haiku', desc: 'Rápido e econômico', speed: '⚡⚡⚡', quality: '⭐⭐⭐⭐', cost: '$' },
  { provider: 'openai' as const, model: 'gpt-4o', name: 'GPT-4o', desc: 'OpenAI — chave API necessária', speed: '⚡⚡', quality: '⭐⭐⭐⭐⭐', cost: '$$' },
  { provider: 'openai' as const, model: 'gpt-4o-mini', name: 'GPT-4o Mini', desc: 'Mais econômico com OpenAI', speed: '⚡⚡⚡', quality: '⭐⭐⭐⭐', cost: '$' },
  { provider: 'deepseek' as const, model: 'deepseek-v3', name: 'DeepSeek V3', desc: 'Chave API DeepSeek', speed: '⚡⚡', quality: '⭐⭐⭐⭐', cost: '$' },
];

export function WizardStep6() {
  const { wizardData, updateWizardData } = useAgentStore();
  const needsApiKey = wizardData.llm_provider === 'openai' || wizardData.llm_provider === 'deepseek';

  const preview = wizardData.transfer_summary_template
    .replace('{{nome_contato}}', 'João Silva')
    .replace('{{telefone}}', '+5511999999999')
    .replace('{{data}}', new Date().toLocaleDateString('pt-BR'))
    .replace('{{perguntas_respostas}}', '1. Orçamento: R$5.000\n2. Prazo: 30 dias');

  return (
    <div className="space-y-6">
      {/* Transfer */}
      <div className="space-y-4">
        <Label className="text-base font-semibold">Transferência</Label>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Número WhatsApp de destino</Label>
            <Input value={wizardData.transfer_number} onChange={(e) => updateWizardData({ transfer_number: e.target.value })} placeholder="+5511999999999" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Gatilho de transferência</Label>
            <Select value={wizardData.transfer_trigger} onValueChange={(v) => updateWizardData({ transfer_trigger: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="after_all_questions">Após todas as perguntas</SelectItem>
                <SelectItem value="after_specific">Após pergunta específica</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Template do resumo</Label>
          <Textarea value={wizardData.transfer_summary_template} onChange={(e) => updateWizardData({ transfer_summary_template: e.target.value })} rows={4} />
        </div>
        <div className="rounded-lg bg-muted/50 p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Preview do resumo:</p>
          <pre className="text-sm whitespace-pre-wrap">{preview}</pre>
        </div>
      </div>

      {/* LLM */}
      <div className="space-y-4">
        <Label className="text-base font-semibold">Modelo de IA</Label>
        <div className="grid grid-cols-1 gap-3">
          {llmOptions.map((opt) => (
            <Card
              key={opt.model}
              className={`cursor-pointer transition-all ${wizardData.llm_model === opt.model ? 'border-primary ring-2 ring-primary/20' : 'hover:border-primary/30'}`}
              onClick={() => updateWizardData({ llm_provider: opt.provider, llm_model: opt.model })}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-sm">{opt.name}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{opt.speed}</span>
                  <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" />{opt.quality}</span>
                  <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{opt.cost}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {needsApiKey && (
          <div className="space-y-2">
            <Label>API Key ({wizardData.llm_provider === 'openai' ? 'OpenAI' : 'DeepSeek'})</Label>
            <Input type="password" value={wizardData.llm_api_key} onChange={(e) => updateWizardData({ llm_api_key: e.target.value })} placeholder="sk-..." />
          </div>
        )}
      </div>
    </div>
  );
}
