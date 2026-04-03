import { useAgentStore } from '@/stores/agentStore';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

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
        <Label>{isReceptive ? 'Mensagem de boas-vindas' : 'Primeira mensagem de abordagem'}</Label>
        <p className="text-xs text-muted-foreground">
          Variáveis: {'{{nome_contato}}'}, {'{{nome_agente}}'}, {'{{empresa}}'}
        </p>
        <Textarea
          value={message}
          onChange={(e) => updateWizardData({ [field]: e.target.value })}
          rows={4}
          placeholder={isReceptive ? 'Mensagem de boas-vindas...' : 'Mensagem de abordagem...'}
        />
      </div>

      <div className="space-y-2">
        <Label>Preview</Label>
        <div className="rounded-xl bg-muted/50 p-4">
          <div className="max-w-xs ml-auto">
            <div className="rounded-lg bg-primary/20 px-4 py-2 text-sm">
              {preview}
            </div>
            <p className="text-xs text-muted-foreground text-right mt-1">Agora</p>
          </div>
        </div>
      </div>
    </div>
  );
}
