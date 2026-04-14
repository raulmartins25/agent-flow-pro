import { create } from 'zustand';

interface AgentWizardData {
  // Step 1
  name: string;
  type: 'receptive' | 'prospecting';
  device_id: string;
  // Step 2
  agent_persona_name: string;
  company_name: string;
  segment: string;
  tone: 'formal' | 'semi-formal' | 'casual';
  product_service_description: string;
  ai_restrictions: string;
  // Step 3
  welcome_message: string;
  first_prospecting_message: string;
  prospecting_messages: string[];
  // Step 4
  qualification_questions: Array<{
    id: string;
    question: string;
    media?: {
      offer_message: string;
      file_url: string;
      file_name: string;
      file_type: 'image' | 'audio' | 'document' | 'video';
      send_condition: 'positive_response' | 'always' | 'explicit_yes';
    };
  }>;
  // Step 5
  objection_handlers: Array<{ objection: string; response: string }>;
  followup_enabled: boolean;
  followup_start_message: number;
  followup_max: number;
  followup_interval_minutes: number;
  ban_triggers: string[];
  // Step 6
  transfer_number: string;
  transfer_trigger: string;
  transfer_summary_template: string;
  llm_provider: 'claude' | 'openai' | 'deepseek';
  llm_model: string;
  llm_api_key: string;
}

interface AgentStore {
  wizardData: AgentWizardData;
  editingAgentId: string | null;
  currentStep: number;
  setCurrentStep: (step: number) => void;
  updateWizardData: (data: Partial<AgentWizardData>) => void;
  loadWizardData: (data: Partial<AgentWizardData>, agentId: string) => void;
  resetWizard: () => void;
}

const initialWizardData: AgentWizardData = {
  name: '',
  type: 'receptive',
  device_id: '',
  agent_persona_name: '',
  company_name: '',
  segment: '',
  tone: 'semi-formal',
  product_service_description: '',
  ai_restrictions: '',
  welcome_message: 'Olá {{nome_contato}}! 👋 Sou {{nome_agente}} da {{empresa}}. Como posso te ajudar hoje?',
  first_prospecting_message: 'Olá {{nome_contato}}! 👋 Sou {{nome_agente}} da {{empresa}}. Tudo bem?',
  prospecting_messages: ['Olá {{nome_contato}}! 👋 Sou {{nome_agente}} da {{empresa}}. Tudo bem?'],
  qualification_questions: [],
  objection_handlers: [
    { objection: 'Não tenho interesse', response: 'Entendo perfeitamente! Caso mude de ideia, estou à disposição. 😊' },
    { objection: 'Já tenho fornecedor', response: 'Legal! Ter opções é sempre bom. Posso te mostrar nosso diferencial?' },
    { objection: 'Tá caro', response: 'Compreendo! Vamos ver como podemos adequar à sua realidade?' },
  ],
  followup_enabled: true,
  followup_start_message: 3,
  followup_max: 3,
  followup_interval_minutes: 120,
  ban_triggers: ['para', 'stop', 'me tira', 'não quero', 'denuncia', 'spam', 'me bloqueia'],
  transfer_number: '',
  transfer_trigger: 'after_all_questions',
  transfer_summary_template: '📋 *Resumo do Lead*\n\n👤 Nome: {{nome_contato}}\n📱 Telefone: {{telefone}}\n📅 Data: {{data}}\n\n{{perguntas_respostas}}',
  llm_provider: 'claude',
  llm_model: 'claude-sonnet-4-20250514',
  llm_api_key: '',
};

export const useAgentStore = create<AgentStore>((set) => ({
  wizardData: { ...initialWizardData },
  editingAgentId: null,
  currentStep: 0,
  setCurrentStep: (step) => set({ currentStep: step }),
  updateWizardData: (data) => set((state) => ({
    wizardData: { ...state.wizardData, ...data },
  })),
  loadWizardData: (data, agentId) => set({
    wizardData: { ...initialWizardData, ...data },
    editingAgentId: agentId,
    currentStep: 0,
  }),
  resetWizard: () => set({ wizardData: { ...initialWizardData }, editingAgentId: null, currentStep: 0 }),
}));
