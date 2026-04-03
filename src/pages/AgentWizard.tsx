import { useNavigate } from 'react-router-dom';
import { useAgentStore } from '@/stores/agentStore';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { WizardStep1 } from '@/components/wizard/WizardStep1';
import { WizardStep2 } from '@/components/wizard/WizardStep2';
import { WizardStep3 } from '@/components/wizard/WizardStep3';
import { WizardStep4 } from '@/components/wizard/WizardStep4';
import { WizardStep5 } from '@/components/wizard/WizardStep5';
import { WizardStep6 } from '@/components/wizard/WizardStep6';
import { compileAgentPrompt } from '@/lib/compilePrompt';

const steps = [
  { title: 'Tipo e Conexão', component: WizardStep1 },
  { title: 'Identidade', component: WizardStep2 },
  { title: 'Mensagem Inicial', component: WizardStep3 },
  { title: 'Qualificação', component: WizardStep4 },
  { title: 'Objeções e Followup', component: WizardStep5 },
  { title: 'Transferência e LLM', component: WizardStep6 },
];

export default function AgentWizard() {
  const navigate = useNavigate();
  const { wizardData, currentStep, setCurrentStep, resetWizard } = useAgentStore();
  const user = useAuthStore((s) => s.user);

  const StepComponent = steps[currentStep].component;

  const handleSave = async () => {
    if (!user) return;
    const prompt = compileAgentPrompt(wizardData);

    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .insert({
        user_id: user.id,
        name: wizardData.name,
        type: wizardData.type,
        status: 'inactive',
        evolution_instance: wizardData.evolution_instance,
        evolution_api_url: wizardData.evolution_api_url,
        evolution_api_key: wizardData.evolution_api_key,
        transfer_number: wizardData.transfer_number,
        transfer_trigger: wizardData.transfer_trigger,
        llm_provider: wizardData.llm_provider,
        llm_model: wizardData.llm_model,
        llm_api_key: wizardData.llm_api_key,
        prompt_compiled: prompt,
        followup_start_message: wizardData.followup_start_message,
        followup_max: wizardData.followup_max,
        followup_interval_minutes: wizardData.followup_interval_minutes,
        restrictions: wizardData.ai_restrictions,
      })
      .select()
      .single();

    if (agentError) {
      toast.error('Erro ao criar agente: ' + agentError.message);
      return;
    }

    const { error: configError } = await supabase.from('agent_config').insert({
      agent_id: agent.id,
      agent_persona_name: wizardData.agent_persona_name,
      company_name: wizardData.company_name,
      segment: wizardData.segment,
      tone: wizardData.tone,
      product_service_description: wizardData.product_service_description,
      welcome_message: wizardData.welcome_message,
      first_prospecting_message: wizardData.first_prospecting_message,
      qualification_questions: wizardData.qualification_questions,
      objection_handlers: wizardData.objection_handlers,
      ai_restrictions: wizardData.ai_restrictions,
      transfer_summary_template: wizardData.transfer_summary_template,
    });

    if (configError) {
      toast.error('Erro ao salvar configurações: ' + configError.message);
      return;
    }

    toast.success('Agente criado com sucesso!');
    resetWizard();
    navigate('/agents');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Novo Agente</h1>
        <p className="text-muted-foreground">Configure seu agente em 6 etapas</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center flex-1">
            <button
              onClick={() => i < currentStep && setCurrentStep(i)}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                i === currentStep
                  ? 'bg-primary text-primary-foreground'
                  : i < currentStep
                  ? 'bg-primary/20 text-primary cursor-pointer'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {i + 1}
            </button>
            {i < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 ${i < currentStep ? 'bg-primary/40' : 'bg-muted'}`} />
            )}
          </div>
        ))}
      </div>

      <p className="text-sm font-medium text-muted-foreground">
        Etapa {currentStep + 1}: {steps[currentStep].title}
      </p>

      <StepComponent />

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={() => currentStep > 0 ? setCurrentStep(currentStep - 1) : navigate('/agents')} >
          {currentStep === 0 ? 'Cancelar' : 'Voltar'}
        </Button>
        {currentStep < steps.length - 1 ? (
          <Button onClick={() => setCurrentStep(currentStep + 1)}>Próximo</Button>
        ) : (
          <Button onClick={handleSave}>Salvar e Gerar Prompt</Button>
        )}
      </div>
    </div>
  );
}
