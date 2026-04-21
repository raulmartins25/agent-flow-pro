import { useRef, useCallback, useState } from 'react';
import { useAgentStore } from '@/stores/agentStore';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Sparkles, Zap, DollarSign, Smile, CheckCircle2, AlertCircle, ChevronDown, Settings, Wand2 } from 'lucide-react';
import { compileAgentPrompt } from '@/lib/compilePrompt';

const formatPhone = (digits: string) => {
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
  if (digits.length <= 9) return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4)}`;
  return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
};

const llmOptions = [
  { provider: 'claude' as const, model: 'claude-sonnet-4-20250514', name: 'Claude Sonnet', desc: 'Melhor qualidade', speed: '⚡⚡', quality: '⭐⭐⭐⭐⭐', cost: '$$' },
  { provider: 'claude' as const, model: 'claude-haiku-4-5-20251001', name: 'Claude Haiku', desc: 'Rápido e econômico', speed: '⚡⚡⚡', quality: '⭐⭐⭐⭐', cost: '$' },
  { provider: 'openai' as const, model: 'gpt-4o', name: 'GPT-4o', desc: 'OpenAI — chave API necessária', speed: '⚡⚡', quality: '⭐⭐⭐⭐⭐', cost: '$$' },
  { provider: 'openai' as const, model: 'gpt-4o-mini', name: 'GPT-4o Mini', desc: 'Mais econômico com OpenAI', speed: '⚡⚡⚡', quality: '⭐⭐⭐⭐', cost: '$' },
  { provider: 'deepseek' as const, model: 'deepseek-chat', name: 'DeepSeek V3 (Chat)', desc: 'Chave API DeepSeek', speed: '⚡⚡', quality: '⭐⭐⭐⭐', cost: '$' },
  { provider: 'deepseek' as const, model: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoner)', desc: 'Raciocínio profundo — DeepSeek', speed: '⚡', quality: '⭐⭐⭐⭐⭐', cost: '$$' },
];

const standardVars = [
  { label: '👤 Nome', value: '{{nome_contato}}' },
  { label: '📱 Telefone', value: '{{telefone}}' },
  { label: '📅 Data', value: '{{data}}' },
  { label: '🤖 Agente', value: '{{agente}}' },
  { label: '📋 Todas P&R', value: '{{perguntas_respostas}}' },
];

const emojiList = [
  '👋', '😊', '✅', '📋', '👤', '📱', '📅', '🎯', '💰', '🔥',
  '⭐', '📝', '📞', '💼', '🏢', '❤️', '👍', '🙏', '🚀', '💡',
  '✨', '🏆', '💪', '🤝', '📊', '🔑', '💳', '🛒', '📦', '🎉',
];

export function WizardStep6() {
  const { wizardData, updateWizardData } = useAgentStore();
  const needsApiKey = wizardData.llm_provider === 'openai' || wizardData.llm_provider === 'deepseek';
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const handleGeneratePrompt = () => {
    const generated = compileAgentPrompt(wizardData as any);
    updateWizardData({ custom_prompt: generated });
  };

  const insertAtCursor = useCallback((text: string) => {
    const el = textareaRef.current;
    if (!el) {
      updateWizardData({ transfer_summary_template: wizardData.transfer_summary_template + text });
      return;
    }
    const start = el.selectionStart ?? wizardData.transfer_summary_template.length;
    const end = el.selectionEnd ?? start;
    const before = wizardData.transfer_summary_template.slice(0, start);
    const after = wizardData.transfer_summary_template.slice(end);
    const newVal = before + text + after;
    updateWizardData({ transfer_summary_template: newVal });
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  }, [wizardData.transfer_summary_template, updateWizardData]);

  const questions = wizardData.qualification_questions || [];

  // Build preview
  let preview = wizardData.transfer_summary_template
    .replace(/\{\{nome_contato\}\}/g, 'João Silva')
    .replace(/\{\{telefone\}\}/g, '+5511999999999')
    .replace(/\{\{data\}\}/g, new Date().toLocaleDateString('pt-BR'))
    .replace(/\{\{agente\}\}/g, wizardData.agent_persona_name || 'Meu Agente');

  // Replace individual question vars
  questions.forEach((q: any, i: number) => {
    const num = i + 1;
    preview = preview
      .replace(new RegExp(`\\{\\{pergunta_${num}\\}\\}`, 'g'), q.question || `Pergunta ${num}`)
      .replace(new RegExp(`\\{\\{resposta_${num}\\}\\}`, 'g'), `Resposta do lead ${num}`);
  });

  // Replace bulk
  const bulkExample = questions.length > 0
    ? questions.map((q: any, i: number) => `*${i + 1}. ${q.question}*\n→ Resposta do lead`).join('\n')
    : '1. Orçamento: R$5.000\n2. Prazo: 30 dias';
  preview = preview.replace(/\{\{perguntas_respostas\}\}/g, bulkExample);

  return (
    <div className="space-y-6">
      {/* Transfer */}
      <div className="space-y-4">
        <Label className="text-base font-semibold">Transferência</Label>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Número WhatsApp de destino</Label>
            <Input
              value={formatPhone(wizardData.transfer_number.replace(/\D/g, ''))}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, '').slice(0, 13);
                updateWizardData({ transfer_number: raw });
              }}
              placeholder="55 11 99999-9999"
            />
            {(() => {
              const digits = wizardData.transfer_number.replace(/\D/g, '');
              if (digits.length === 0) return null;
              if (digits.length >= 12 && digits.length <= 13) {
                return <p className="text-xs text-green-500 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Formato válido</p>;
              }
              return <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Número incompleto — use: 55 + DDD + número</p>;
            })()}
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

        {/* Rich template editor */}
        <div className="space-y-2">
          <Label className="text-xs">Template do resumo</Label>

          {/* Variable chips */}
          <div className="flex flex-wrap gap-1.5 items-center">
            {standardVars.map((v) => (
              <Badge
                key={v.value}
                variant="outline"
                className="cursor-pointer hover:bg-primary/10 transition-colors text-xs"
                onClick={() => insertAtCursor(v.value)}
              >
                {v.label}
              </Badge>
            ))}

            {/* Emoji picker */}
            <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-6 w-6 p-0">
                  <Smile className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <div className="grid grid-cols-10 gap-1">
                  {emojiList.map((emoji) => (
                    <button
                      key={emoji}
                      className="text-lg hover:bg-muted rounded p-0.5 transition-colors"
                      onClick={() => { insertAtCursor(emoji); setEmojiOpen(false); }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Question-specific variables */}
          {questions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Perguntas cadastradas:</p>
              <div className="flex flex-wrap gap-1.5">
                {questions.map((q: any, i: number) => {
                  const num = i + 1;
                  const truncated = (q.question || '').length > 20
                    ? (q.question || '').slice(0, 20) + '…'
                    : (q.question || `Pergunta ${num}`);
                  return (
                    <div key={q.id} className="flex gap-1">
                      <Badge
                        variant="outline"
                        className="cursor-pointer hover:bg-primary/10 transition-colors text-xs"
                        onClick={() => insertAtCursor(`{{pergunta_${num}}}`)}
                      >
                        📝{q.media?.file_url ? '📎' : ''} P{num}: {truncated}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="cursor-pointer hover:bg-primary/10 transition-colors text-xs"
                        onClick={() => insertAtCursor(`{{resposta_${num}}}`)}
                      >
                        💬 R{num}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {questions.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Cadastre perguntas no Step 4 para usar variáveis individuais</p>
          )}

          <Textarea
            ref={textareaRef}
            value={wizardData.transfer_summary_template}
            onChange={(e) => updateWizardData({ transfer_summary_template: e.target.value })}
            rows={6}
          />
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

      {/* Advanced: custom prompt editor */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <span className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Avançado: Editar prompt manualmente
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-3">
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 flex gap-2">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-foreground">
              <strong>Recurso avançado.</strong> Editar manualmente desativa a geração automática a partir dos campos do wizard. O texto abaixo será enviado direto para a IA.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="custom-prompt-enabled"
              checked={wizardData.custom_prompt_enabled}
              onCheckedChange={(c) => updateWizardData({ custom_prompt_enabled: !!c })}
            />
            <Label htmlFor="custom-prompt-enabled" className="cursor-pointer text-sm">
              Usar prompt customizado ao salvar
            </Label>
          </div>

          <Button variant="outline" size="sm" onClick={handleGeneratePrompt}>
            <Wand2 className="h-4 w-4 mr-1" />
            Gerar prompt a partir dos campos
          </Button>

          <Textarea
            value={wizardData.custom_prompt}
            onChange={(e) => updateWizardData({ custom_prompt: e.target.value })}
            rows={20}
            placeholder='Clique em "Gerar prompt a partir dos campos" para popular este editor, ou escreva seu prompt do zero...'
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">{wizardData.custom_prompt.length} caracteres</p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
