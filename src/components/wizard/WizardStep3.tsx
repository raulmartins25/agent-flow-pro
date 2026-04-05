import { useAgentStore } from '@/stores/agentStore';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle } from 'lucide-react';

export function WizardStep3() {
  const { wizardData, updateWizardData } = useAgentStore();
  const isReceptive = wizardData.type === 'receptive';

  const message = isReceptive ? wizardData.welcome_message : wizardData.first_prospecting_message;
  const field = isReceptive ? 'welcome_message' : 'first_prospecting_message';

  const preview = message
    .replace('{{nome_contato}}', 'João')
    .replace('{{nome_agente}}', wizardData.agent_persona_name || 'Agente')
    .replace('{{empresa}}', wizardData.company_name || 'Empresa');

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>
          {isReceptive ? 'Mensagem de boas-vindas' : 'Mensagem de disparo (enviada por você)'}
        </Label>
        <p className="text-xs text-muted-foreground">
          {isReceptive
            ? <>Variáveis: {'{{nome_contato}}'}, {'{{nome_agente}}'}, {'{{empresa}}'}</>
            : 'Esta mensagem será enviada manualmente via módulo de Disparos. A IA NÃO envia esta mensagem — ela só entra em ação após o lead responder.'}
        </p>
        <Textarea
          value={message}
          onChange={(e) => updateWizardData({ [field]: e.target.value })}
          rows={4}
          placeholder={
            isReceptive
              ? 'Mensagem de boas-vindas...'
              : 'Ex: Olá {{nome_contato}}! Vi que você tem interesse em [tema]. Posso te enviar algumas informações?'
          }
        />
        <p className="text-xs text-muted-foreground">
          Variáveis: {'{{nome_contato}}'}, {'{{nome_agente}}'}, {'{{empresa}}'}
        </p>
      </div>

      {!isReceptive && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-200">
            <strong>⚡ Fluxo de prospecção:</strong> Você dispara → Lead responde → IA assume a conversa automaticamente a partir da primeira resposta do lead.
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Preview</Label>
        <div className="rounded-xl bg-muted/50 p-4">
          <div className={isReceptive ? 'max-w-xs ml-auto' : 'max-w-xs ml-auto'}>
            <div className={`rounded-lg px-4 py-2 text-sm ${isReceptive ? 'bg-primary/20' : 'bg-blue-500/20'}`}>
              {preview}
            </div>
            <p className="text-xs text-muted-foreground text-right mt-1">
              {isReceptive ? 'Agora' : 'Enviado por você (disparo)'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
