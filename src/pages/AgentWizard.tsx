import { useNavigate, useParams } from 'react-router-dom';
import { Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAgentStore } from '@/stores/agentStore';
import { dentalClinicDraft } from '@/lib/draftTemplates';
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
import { WizardStep7 } from '@/components/wizard/WizardStep7';
import { useState, useEffect } from 'react';

const steps = [
  { title: 'Tipo & Conexão', component: WizardStep1 },
  { title: 'Identidade', component: WizardStep2 },
  { title: 'Mensagem Inicial', component: WizardStep3 },
  { title: 'Qualificação', component: WizardStep4 },
  { title: 'Objeções & Followup', component: WizardStep5 },
  { title: 'Transferência & LLM', component: WizardStep6 },
  { title: 'Integrações', component: WizardStep7 },
];

export default function AgentWizard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { wizardData, currentStep, setCurrentStep, resetWizard, editingAgentId, loadWizardData, updateWizardData } = useAgentStore();
  const user = useAuthStore((s) => s.user);
  const [saving, setSaving] = useState(false);
  const [loadingAgent, setLoadingAgent] = useState(false);

  const isEditing = !!id;

  // Load agent data when editing
  useEffect(() => {
    if (!id) return;
    if (editingAgentId === id) return; // already loaded

    const loadAgent = async () => {
      setLoadingAgent(true);
      try {
        const { data: agent, error: agentError } = await supabase
          .from('agents')
          .select('*')
          .eq('id', id)
          .single();
        if (agentError || !agent) throw agentError || new Error('Agente não encontrado');

        const { data: config } = await supabase
          .from('agent_config')
          .select('*')
          .eq('agent_id', id)
          .single();

        const { data: ecuroIntegRow } = await supabase
          .from('agent_integrations')
          .select('*')
          .eq('agent_id', id)
          .eq('provider', 'ecuro')
          .maybeSingle();
        const ecuroCfg = (ecuroIntegRow?.config as any) || {};

        loadWizardData({
          name: agent.name,
          type: agent.type,
          device_id: agent.device_id || '',
          llm_provider: agent.llm_provider,
          llm_model: agent.llm_model || '',
          llm_api_key: agent.llm_api_key || '',
          transfer_number: agent.transfer_number || '',
          transfer_trigger: agent.transfer_trigger || 'after_all_questions',
          followup_enabled: (agent.followup_max ?? 3) > 0,
          followup_start_message: agent.followup_start_message ?? 3,
          followup_max: (agent.followup_max ?? 3) > 0 ? (agent.followup_max ?? 3) : 3,
          followup_interval_minutes: agent.followup_interval_minutes ?? 120,
          ai_restrictions: config?.ai_restrictions || '',
          agent_persona_name: config?.agent_persona_name || '',
          company_name: config?.company_name || '',
          segment: config?.segment || '',
          tone: config?.tone || 'semi-formal',
          product_service_description: config?.product_service_description || '',
          welcome_message: config?.welcome_message || '',
          first_prospecting_message: config?.first_prospecting_message || '',
          prospecting_messages: Array.isArray(config?.prospecting_messages) && (config.prospecting_messages as string[]).length > 0
            ? (config.prospecting_messages as string[])
            : config?.first_prospecting_message
              ? [config.first_prospecting_message]
              : [''],
          qualification_questions: (config?.qualification_questions as any[]) || [],
          objection_handlers: (config?.objection_handlers as any[]) || [],
          transfer_summary_template: config?.transfer_summary_template || '',
          ban_triggers: agent.restrictions ? agent.restrictions.split(',').map((s: string) => s.trim()) : ['para', 'stop', 'me tira', 'não quero', 'denuncia', 'spam', 'me bloqueia'],
          ecuro_enabled: !!ecuroIntegRow?.enabled,
          ecuro_environment: (ecuroCfg.environment as 'dev' | 'prod') || 'dev',
          ecuro_clinic_id: ecuroCfg.clinic_id || '',
          ecuro_clinic_name: ecuroCfg.clinic_name || '',
          ecuro_specialty_id: ecuroCfg.specialty_id || '',
          ecuro_specialty_name: ecuroCfg.specialty_name || '',
          ecuro_default_duration: ecuroCfg.default_duration || 30,
        }, id);
      } catch (e: any) {
        toast.error(e.message || 'Erro ao carregar agente');
        navigate('/agents');
      } finally {
        setLoadingAgent(false);
      }
    };
    loadAgent();
  }, [id]);

  const validateStep = (): string | null => {
    switch (currentStep) {
      case 0:
        if (!wizardData.name.trim()) return 'Nome do agente é obrigatório';
        // device_id é opcional — sem dispositivo, agente fica em modo simulação
        break;
      case 1:
        if (!wizardData.agent_persona_name.trim()) return 'Nome do agente persona é obrigatório';
        if (!wizardData.company_name.trim()) return 'Nome da empresa é obrigatório';
        if (!wizardData.product_service_description.trim()) return 'Descrição do produto/serviço é obrigatória';
        break;
      case 2:
        if (wizardData.type === 'receptive' && !wizardData.welcome_message.trim()) return 'Mensagem de boas-vindas é obrigatória';
        if (wizardData.type === 'prospecting') {
          const hasMsg = wizardData.prospecting_messages.some(m => m.trim());
          if (!hasMsg) return 'Pelo menos uma variação de mensagem é obrigatória';
        }
        break;
      case 5:
        if (wizardData.llm_provider !== 'claude' && !wizardData.llm_api_key.trim()) return 'API Key da LLM é obrigatória';
        break;
      case 6:
        if (wizardData.ecuro_enabled) {
          if (!wizardData.ecuro_clinic_id) return 'Selecione a clínica Ecuro';
          if (!wizardData.ecuro_specialty_id) return 'Selecione a especialidade Ecuro padrão';
        }
        break;
    }
    return null;
  };

  const handleNext = () => {
    const error = validateStep();
    if (error) { toast.error(error); return; }
    setCurrentStep(currentStep + 1);
  };

  const saveEcuroIntegration = async (agentId: string) => {
    if (wizardData.ecuro_enabled) {
      const { error: ecuroError } = await supabase
        .from('agent_integrations')
        .upsert({
          agent_id: agentId,
          provider: 'ecuro',
          enabled: true,
          config: {
            environment: wizardData.ecuro_environment,
            clinic_id: wizardData.ecuro_clinic_id,
            clinic_name: wizardData.ecuro_clinic_name,
            specialty_id: wizardData.ecuro_specialty_id,
            specialty_name: wizardData.ecuro_specialty_name,
            default_duration: wizardData.ecuro_default_duration,
          },
        }, { onConflict: 'agent_id,provider' });
      if (ecuroError) throw ecuroError;
    } else {
      // Disable existing integration if any
      await supabase
        .from('agent_integrations')
        .update({ enabled: false })
        .eq('agent_id', agentId)
        .eq('provider', 'ecuro');
    }
  };

  const handleSave = async () => {
    if (!user) { toast.error('Faça login para salvar'); return; }
    const error = validateStep();
    if (error) { toast.error(error); return; }

    const deviceId = wizardData.device_id || null;
    const simulationOnly = !deviceId;

    // Check device conflict only if a device was selected
    if (deviceId) {
      const { data: existingAgents } = await supabase
        .from('agents')
        .select('id, name')
        .eq('device_id', deviceId)
        .eq('status', 'active')
        .neq('id', isEditing ? id! : '00000000-0000-0000-0000-000000000000');

      if (existingAgents && existingAgents.length > 0) {
        toast.error(`Este dispositivo já tem um agente ativo: ${existingAgents[0].name}`);
        return;
      }
    }

    setSaving(true);
    try {
      const prompt = compileAgentPrompt(wizardData);

      if (isEditing) {
        // Update existing agent
        const { error: agentError } = await supabase
          .from('agents')
          .update({
            name: wizardData.name,
            type: wizardData.type,
            device_id: deviceId,
            status: simulationOnly ? 'paused' : 'active',
            llm_provider: wizardData.llm_provider,
            llm_model: wizardData.llm_model,
            llm_api_key: wizardData.llm_api_key || null,
            prompt_compiled: prompt,
            restrictions: wizardData.ai_restrictions || null,
            transfer_number: wizardData.transfer_number || null,
            transfer_trigger: wizardData.transfer_trigger || null,
            followup_start_message: wizardData.followup_start_message,
            followup_max: wizardData.followup_enabled ? wizardData.followup_max : 0,
            followup_interval_minutes: wizardData.followup_interval_minutes,
          })
          .eq('id', id!);

        if (agentError) throw agentError;

        const { error: configError } = await supabase
          .from('agent_config')
          .update({
            agent_persona_name: wizardData.agent_persona_name,
            company_name: wizardData.company_name,
            segment: wizardData.segment || null,
            tone: wizardData.tone,
            product_service_description: wizardData.product_service_description,
            welcome_message: wizardData.welcome_message || null,
            first_prospecting_message: wizardData.prospecting_messages[0] || wizardData.first_prospecting_message || null,
            prospecting_messages: wizardData.prospecting_messages.filter(m => m.trim()),
            ai_restrictions: wizardData.ai_restrictions || null,
            qualification_questions: wizardData.qualification_questions,
            objection_handlers: wizardData.objection_handlers,
            transfer_summary_template: wizardData.transfer_summary_template || null,
          })
          .eq('agent_id', id!);

        if (configError) throw configError;

        await saveEcuroIntegration(id!);

        toast.success(simulationOnly ? 'Agente atualizado (modo simulação — sem dispositivo)' : 'Agente atualizado com sucesso!');
      } else {
        // Create new agent
        const { data: agentData, error: agentError } = await supabase
          .from('agents')
          .insert({
            user_id: user.id,
            name: wizardData.name,
            type: wizardData.type,
            status: simulationOnly ? 'paused' : 'active',
            device_id: deviceId,
            llm_provider: wizardData.llm_provider,
            llm_model: wizardData.llm_model,
            llm_api_key: wizardData.llm_api_key || null,
            prompt_compiled: prompt,
            restrictions: wizardData.ai_restrictions || null,
            transfer_number: wizardData.transfer_number || null,
            transfer_trigger: wizardData.transfer_trigger || null,
            followup_start_message: wizardData.followup_start_message,
            followup_max: wizardData.followup_enabled ? wizardData.followup_max : 0,
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
          first_prospecting_message: wizardData.prospecting_messages[0] || wizardData.first_prospecting_message || null,
          prospecting_messages: wizardData.prospecting_messages.filter(m => m.trim()),
          ai_restrictions: wizardData.ai_restrictions || null,
          qualification_questions: wizardData.qualification_questions,
          objection_handlers: wizardData.objection_handlers,
          transfer_summary_template: wizardData.transfer_summary_template || null,
        });

        if (configError) throw configError;

        await saveEcuroIntegration(agentData.id);

        toast.success(simulationOnly ? 'Agente criado em modo simulação (sem dispositivo)' : 'Agente criado com sucesso!');
      }

      resetWizard();
      navigate('/agents');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar agente');
    } finally {
      setSaving(false);
    }
  };

  if (loadingAgent) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const StepComponent = steps[currentStep].component;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">{isEditing ? 'Editar Agente' : 'Novo Agente'}</h1>
          <p className="text-muted-foreground">Configure seu agente passo a passo</p>
        </div>
        {!isEditing && (
          <Button
            variant="outline"
            onClick={() => {
              updateWizardData(dentalClinicDraft);
              setCurrentStep(0);
              toast.success('Rascunho carregado — revise e ajuste cada passo');
            }}
          >
            <Sparkles className="w-4 h-4" />
            Carregar rascunho: Clínica Odontológica
          </Button>
        )}
      </div>

      {/* Stepper */}
      <div className="flex items-center w-full">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <button
              onClick={() => setCurrentStep(i)}
              className="flex flex-col items-center gap-1.5 group cursor-pointer"
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                  i === currentStep
                    ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                    : i < currentStep
                    ? 'bg-primary/20 text-primary group-hover:bg-primary/30'
                    : 'bg-muted text-muted-foreground group-hover:bg-muted/80'
                }`}
              >
                {i < currentStep ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className={`hidden md:block text-xs text-center truncate max-w-[80px] transition-colors ${
                  i === currentStep
                    ? 'text-primary font-medium'
                    : i < currentStep
                    ? 'text-primary/70'
                    : 'text-muted-foreground'
                }`}
              >
                {step.title}
              </span>
            </button>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 rounded-full transition-colors ${
                  i < currentStep ? 'bg-primary/40' : 'bg-muted'
                }`}
              />
            )}
          </div>
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
            {saving ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Salvar e Gerar Prompt'}
          </Button>
        )}
      </div>
    </div>
  );
}