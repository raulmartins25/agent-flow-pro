interface AgentData {
  type: 'receptive' | 'prospecting';
  agent_persona_name: string;
  company_name: string;
  segment: string;
  tone: 'formal' | 'semi-formal' | 'casual';
  product_service_description: string;
  ai_restrictions: string;
  welcome_message: string;
  first_prospecting_message: string;
  qualification_questions: Array<{ id: string; question: string }>;
  objection_handlers: Array<{ objection: string; response: string }>;
  followup_start_message: number;
  followup_max: number;
  followup_interval_minutes: number;
  ban_triggers: string[];
  transfer_number: string;
  transfer_trigger: string;
  transfer_summary_template: string;
}

const toneDescriptions: Record<string, string> = {
  formal: 'Formal e profissional. Use linguagem corporativa, trate por "você" de forma respeitosa.',
  'semi-formal': 'Semi-formal. Equilibre profissionalismo com simpatia. Seja acessível mas não informal demais.',
  casual: 'Descontraído e amigável. Use linguagem casual, emojis ocasionais, gírias leves.',
};

export function compileAgentPrompt(data: AgentData): string {
  const questionsFormatted = data.qualification_questions
    .map((q, i) => `${i + 1}. "${q.question}"`)
    .join('\n') || 'Nenhuma pergunta configurada.';

  const objectionsFormatted = data.objection_handlers
    .map((o) => `- Se disser "${o.objection}" → Responda: "${o.response}"`)
    .join('\n') || 'Nenhuma objeção configurada.';

  const intervalHours = data.followup_interval_minutes >= 60
    ? `${data.followup_interval_minutes / 60}h`
    : `${data.followup_interval_minutes}min`;

  const base = `Você é ${data.agent_persona_name || 'um assistente'}, assistente da ${data.company_name || 'empresa'} no segmento de ${data.segment || 'negócios'}.

Tom de comunicação: ${toneDescriptions[data.tone]}

Sobre o que oferecemos: ${data.product_service_description || 'Produtos e serviços da empresa.'}

REGRAS DE COMUNICAÇÃO OBRIGATÓRIAS:
1. NUNCA envie blocos grandes de texto. Máximo 3 linhas por mensagem.
2. SEMPRE demonstre empatia ou faça um comentário sobre a resposta do lead ANTES de fazer a próxima pergunta.
3. Use linguagem natural, como se fosse uma conversa real no WhatsApp.
4. Nunca repita a mesma estrutura de frase duas vezes seguidas.
5. Se o lead usar gírias ou linguagem informal, adapte levemente seu tom.

RESTRIÇÕES ABSOLUTAS:
${data.ai_restrictions || 'Nenhuma restrição específica.'}`;

  let messageSection: string;

  if (data.type === 'receptive') {
    messageSection = `FLUXO DE ATENDIMENTO:
Mensagem de boas-vindas: "${data.welcome_message}"

Após a saudação, conduza o lead pelas seguintes perguntas de qualificação, uma por vez:
${questionsFormatted}`;
  } else {
    messageSection = `CONTEXTO DE PROSPECÇÃO:
Você está participando de uma conversa iniciada por disparo da ${data.company_name || 'empresa'}.
A mensagem de disparo enviada foi: "${data.first_prospecting_message}"
O lead respondeu a essa mensagem. A partir de agora VOCÊ assume a conversa.

REGRAS CRÍTICAS:
- Não mencione que enviamos uma mensagem antes — trate como continuação natural
- Se respondeu positivamente: demonstre empatia com a resposta e inicie qualificação
- Se respondeu com dúvida ou neutralidade: esclareça brevemente e inicie qualificação
- Se respondeu negativamente: trate como objeção inicial usando os handlers configurados
- NUNCA reenvie ou repita a mensagem de disparo
- NUNCA diga "como mencionei antes" ou similar

Perguntas de qualificação (uma por vez, aguarde resposta antes da próxima):
${questionsFormatted}`;
  }

  return `${base}

${messageSection}

TRATAMENTO DE OBJEÇÕES:
${objectionsFormatted}

REGRAS DE FOLLOWUP:
- Se o lead não responder após a mensagem ${data.followup_start_message}, inicie followup.
- Máximo de ${data.followup_max} tentativas, com intervalo de ${intervalHours}.

ENCERRAMENTO E TRANSFERÊNCIA:
Quando ${data.transfer_trigger === 'after_all_questions' ? 'todas as perguntas forem respondidas' : 'a pergunta específica for respondida'}, envie ao número ${data.transfer_number || '[não configurado]'} o seguinte resumo:
${data.transfer_summary_template}

PROTEÇÃO ANTI-BAN:
Se o lead demonstrar irritação, usar as palavras-chave de encerramento (${data.ban_triggers.join(', ')}), ou qualquer sinal de que não quer receber mensagens:
1. Responda: "Entendido! Não te incomodarei mais. Qualquer dúvida, estaremos aqui!"
2. Encerre o atendimento imediatamente.
3. NUNCA tente reconverter um lead que pediu para parar.

ESTADO DA CONVERSA:
Você tem acesso ao histórico completo da conversa. Use-o para não repetir perguntas já respondidas e para personalizar suas respostas.`;
}
