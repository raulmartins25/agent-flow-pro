import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAgentStore } from '@/stores/agentStore';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { compileAgentPrompt } from '@/lib/compilePrompt';
import { toast } from 'sonner';
import { WizardStep1 } from '@/components/wizard/WizardStep1';
import { WizardStep2 } from '@/components/wizard/WizardStep2';
import { WizardStep3 } from '@/components/wizard/WizardStep3';
import { WizardStep4 } from '@/components/wizard/WizardStep4';
import { WizardStep5 } from '@/components/wizard/WizardStep5';
import { WizardStep6 } from '@/components/wizard/WizardStep6';
import { useState } from 'react';

const steps = [
  { title: 'Tipo & Conexão', component: WizardStep1 },
  { title: 'Identidade', component: WizardStep2 },
  { title: 'Mensagem Inicial', component: WizardStep3 },
  { title: 'Qualificação', component: WizardStep4 },
  { title: 'Objeções & Followup', component: WizardStep5 },
  { title: 'Transferência & LLM', component: WizardStep6 },
];

export default function AgentWizard() {
  const navigate = useNavigate();
  const { wizardData, currentStep, setCurrentStep, resetWizard } = useAgentStore();
  const user = useAuthStore((s) => s.user);
  const [saving, setSaving] = useState(false);

  const validateStep = (): string | null => {
    switch (currentStep) {
      case 0:
        if (!wizardData.name.trim()) return 'Nome do agente é obrigatório';
        if (!wizardData.device_id) return 'Selecione um dispositivo WhatsApp';
        break;
      case 1:
        if (!wizardData.agent_persona_name.trim()) return 'Nome do agente persona é obrigatório';
        if (!wizardData.company_name.trim()) return 'Nome da empresa é obrigatório';
        if (!wizardData.product_service_description.trim()) return 'Descrição do produto/serviço é obrigatória';
        break;
      case 2:
        if (wizardData.type === 'receptive' && !wizardData.welcome_message.trim()) return 'Mensagem de boas-vindas é obrigatória';
        if (wizardData.type === 'prospecting' && !wizardData.first_prospecting_message.trim()) return 'Mensagem de prospecção é obrigatória';
        break;
      case 5:
        if (wizardData.llm_provider !== 'claude' && !wizardData.llm_api_key.trim()) return 'API Key da LLM é obrigatória';
        break;
    }
    return null;
  };

  const handleNext = () => {
    const error = validateStep();
    if (error) { toast.error(error); return; }
    setCurrentStep(currentStep + 1);
  };

  const handleSave = async () => {
    if (!user) { toast.error('Faça login para salvar'); return; }
    const error = validateStep();
    if (error) { toast.error(error); return; }

    // Check if device already has an active agent
    const { data: existingAgents } = await supabase
      .from('agents')
      .select('id, name')
      .eq('device_id', wizardData.device_id)
      .eq('status', 'active');

    if (existingAgents && existingAgents.length > 0) {
      toast.error(`Este dispositivo já tem um agente ativo: ${existingAgents[0].name}`);
      return;
    }

    setSaving(true);
    try {
      const prompt = compileAgentPrompt(wizardData);

      const { data: agentData, error: agentError } = await supabase
        .from('agents')
        .insert({
          user_id: user.id,
          name: wizardData.name,
          type: wizardData.type,
          status: 'active',
          device_id: wizardData.device_id,
          llm_provider: wizardData.llm_provider,
          llm_model: wizardData.llm_model,
          llm_api_key: wizardData.llm_api_key || null,
          prompt_compiled: prompt,
          restrictions: wizardData.ai_restrictions || null,
          transfer_number: wizardData.transfer_number || null,
          transfer_trigger: wizardData.transfer_trigger || null,
          followup_start_message: wizardData.followup_start_message,
          followup_max: wizardData.followup_max,
          followup_interval_minutes: wizardData.followup_interval_minutes,
        })
        .select()
        .single();

      if (agentError) throw agentError;

      const { error: configError } = await supabase.from('agent_config').insert({
        agent_id: agentData.id,
        agent_persona_name: wizardData.agent_persona_name,
        company_name: wizardData.company_name,
        segment: wizardData.segment || null,
        tone: wizardData.tone,
        product_service_description: wizardData.product_service_description,
        welcome_message: wizardData.welcome_message || null,
        first_prospecting_message: wizardData.first_prospecting_message || null,
        ai_restrictions: wizardData.ai_restrictions || null,
        qualification_questions: wizardData.qualification_questions,
        objection_handlers: wizardData.objection_handlers,
        transfer_summary_template: wizardData.transfer_summary_template || null,
      });

      if (configError) throw configError;

      toast.success('Agente criado com sucesso!');
      resetWizard();
      navigate('/agents');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar agente');
    } finally {
      setSaving(false);
    }
  };

  const StepComponent = steps[currentStep].component;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Novo Agente</h1>
        <p className="text-muted-foreground">Configure seu agente passo a passo</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {steps.map((step, i) => (
          <button key={i} onClick={() => i < currentStep && setCurrentStep(i)}
            className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full transition-colors ${
              i === currentStep ? 'bg-primary text-primary-foreground' :
              i < currentStep ? 'bg-primary/20 text-primary cursor-pointer hover:bg-primary/30' :
              'bg-muted text-muted-foreground'}`}>
            <span className="font-semibold">{i + 1}</span>
            <span className="hidden md:inline">{step.title}</span>
          </button>
        ))}
      </div>

      <StepComponent />

      <div className="flex justify-between pt-4">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { resetWizard(); navigate('/agents'); }}>Cancelar</Button>
          {currentStep > 0 && <Button variant="outline" onClick={() => setCurrentStep(currentStep - 1)}>Voltar</Button>}
        </div>
        {currentStep < steps.length - 1 ? (
          <Button onClick={handleNext}>Próximo</Button>
        ) : (
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar e Gerar Prompt'}
          </Button>
        )}
      </div>
    </div>
  );
}
