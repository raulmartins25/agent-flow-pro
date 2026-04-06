import { useState } from 'react';
import { useAgentStore } from '@/stores/agentStore';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Plus, X, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

function calculateSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  const wordsA = new Set(normalize(a));
  const wordsB = new Set(normalize(b));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let different = 0;
  wordsB.forEach(w => { if (!wordsA.has(w)) different++; });
  return different / wordsB.size;
}

export function WizardStep3() {
  const { wizardData, updateWizardData } = useAgentStore();
  const isReceptive = wizardData.type === 'receptive';
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [generating, setGenerating] = useState(false);

  // Receptive: simple welcome message
  if (isReceptive) {
    const preview = wizardData.welcome_message
      .replace('{{nome_contato}}', 'João')
      .replace('{{nome_agente}}', wizardData.agent_persona_name || 'Agente')
      .replace('{{empresa}}', wizardData.company_name || 'Empresa');

    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Label>Mensagem de boas-vindas</Label>
          <p className="text-xs text-muted-foreground">
            Variáveis: {'{{nome_contato}}'}, {'{{nome_agente}}'}, {'{{empresa}}'}
          </p>
          <Textarea
            value={wizardData.welcome_message}
            onChange={(e) => updateWizardData({ welcome_message: e.target.value })}
            rows={4}
            placeholder="Mensagem de boas-vindas..."
          />
        </div>
        <div className="space-y-2">
          <Label>Preview</Label>
          <div className="rounded-xl bg-muted/50 p-4">
            <div className="max-w-xs ml-auto">
              <div className="rounded-lg px-4 py-2 text-sm bg-primary/20">{preview}</div>
              <p className="text-xs text-muted-foreground text-right mt-1">Agora</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Prospecting: multiple variations
  const messages = wizardData.prospecting_messages.length > 0
    ? wizardData.prospecting_messages
    : [wizardData.first_prospecting_message || ''];

  const updateMessage = (index: number, value: string) => {
    const updated = [...messages];
    updated[index] = value;
    updateWizardData({
      prospecting_messages: updated,
      first_prospecting_message: updated[0] || '',
    });
  };

  const addVariation = () => {
    if (messages.length >= 5) return;
    updateWizardData({
      prospecting_messages: [...messages, ''],
    });
  };

  const removeVariation = (index: number) => {
    if (messages.length <= 1) return;
    const updated = messages.filter((_, i) => i !== index);
    updateWizardData({
      prospecting_messages: updated,
      first_prospecting_message: updated[0] || '',
    });
    if (focusedIndex >= updated.length) setFocusedIndex(updated.length - 1);
  };

  const generateVariations = async () => {
    const firstMsg = messages[0]?.trim();
    if (!firstMsg) {
      toast.error('Escreva a primeira variação antes de gerar');
      return;
    }
    const count = Math.min(5 - messages.length, 4);
    if (count <= 0) {
      toast.error('Já atingiu o máximo de 5 variações');
      return;
    }

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-variations', {
        body: { message: firstMsg, count },
      });
      if (error) throw error;
      const variations: string[] = data?.variations || [];
      if (variations.length === 0) throw new Error('Nenhuma variação gerada');

      const newMessages = [...messages, ...variations].slice(0, 5);
      updateWizardData({
        prospecting_messages: newMessages,
        first_prospecting_message: newMessages[0],
      });
      toast.success(`${variations.length} variação(ões) gerada(s)!`);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao gerar variações');
    } finally {
      setGenerating(false);
    }
  };

  const safeIndex = Math.min(focusedIndex, messages.length - 1);
  const previewMsg = (messages[safeIndex] || '')
    .replace(/\{\{nome_contato\}\}/g, 'João')
    .replace(/\{\{nome_agente\}\}/g, wizardData.agent_persona_name || 'Agente')
    .replace(/\{\{empresa\}\}/g, wizardData.company_name || 'Empresa');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label className="text-base font-semibold">Variações da mensagem de disparo</Label>
          <p className="text-xs text-muted-foreground">
            Crie até 5 versões da mesma mensagem. O sistema rotaciona aleatoriamente entre elas a cada disparo, reduzindo risco de banimento.
          </p>
          <Badge variant="outline" className="text-xs mt-1">Recomendado: mínimo 3 variações</Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={generateVariations}
          disabled={generating}
          className="shrink-0"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
          Gerar com IA
        </Button>
      </div>

      <p className="text-xs text-muted-foreground -mt-4">
        Esta mensagem será enviada via módulo de Disparos. A IA NÃO envia esta mensagem — ela só entra em ação após o lead responder.
      </p>

      {/* Variations list */}
      <div className="space-y-4">
        {messages.map((msg, i) => {
          const similarity = i > 0 && msg.trim() && messages[0].trim()
            ? calculateSimilarity(messages[0], msg)
            : null;

          return (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Variação {i + 1}</Label>
                  {similarity !== null && (
                    similarity >= 0.4
                      ? <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30">Boa variação</Badge>
                      : <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">Muito similar</Badge>
                  )}
                </div>
                {messages.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeVariation(i)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <Textarea
                value={msg}
                onChange={(e) => updateMessage(i, e.target.value)}
                onFocus={() => setFocusedIndex(i)}
                rows={3}
                placeholder={`Ex: Olá {{nome_contato}}! Sou {{nome_agente}} da {{empresa}}. Tudo bem?`}
              />
            </div>
          );
        })}
      </div>

      {messages.length < 5 && (
        <Button variant="outline" size="sm" onClick={addVariation} className="w-full">
          <Plus className="h-4 w-4 mr-1" /> Adicionar variação
        </Button>
      )}

      <p className="text-xs text-muted-foreground">
        Variáveis: {'{{nome_contato}}'}, {'{{nome_agente}}'}, {'{{empresa}}'}
      </p>

      <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
        <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
        <div className="text-sm text-amber-200">
          <strong>⚡ Fluxo de prospecção:</strong> Você dispara → Lead responde → IA assume a conversa automaticamente a partir da primeira resposta do lead.
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <Label>Preview da variação {safeIndex + 1}:</Label>
        <div className="rounded-xl bg-muted/50 p-4">
          <div className="max-w-xs ml-auto">
            <div className="rounded-lg px-4 py-2 text-sm bg-blue-500/20">{previewMsg}</div>
            <p className="text-xs text-muted-foreground text-right mt-1">Enviado por você via disparo</p>
          </div>
        </div>
      </div>
    </div>
  );
}
