

## Plano: Criar agente receptivo "Clínica Odontológica" + integração Ecuro

### Resumo
Criar manualmente um novo agente receptivo no wizard com toda a configuração odontológica fornecida, mais integração com API da Ecuro para agendamento (requer credenciais).

### Parte 1 — Configuração do agente (wizard, sem código)

Você abre `/agents/new` e preenche os 6 passos com os dados abaixo.

**Step 1 — Tipo e dispositivo**
- Tipo: **Receptivo**
- Nome: `Clínica Odontológica`
- Dispositivo: selecionar o WhatsApp da clínica

**Step 2 — Identidade**
- Persona: definir (ex: `Ana`)
- Empresa: `[Nome da Clínica]`
- Segmento: `Odontologia`
- Tom: **Semi-formal**
- Descrição produto/serviço: especialidades + diferenciais (implante protocolo, zigomático, ortodontia, estética, odontopediatria, avaliação gratuita com exame de imagem, anestesia geral)
- Restrições da IA: bloco completo "RESTRIÇÕES E INSTRUÇÕES DE COMPORTAMENTO" do prompt (fluxo após 4 perguntas, regras de agendamento, recusa, cancelamento, valores, descontos, planos, aposentados, odontopediatria, acompanhante, identidade, mensagem duplicada)

**Step 3 — Mensagem de boas-vindas**
```
Olá {{nome_contato}}! Seja bem-vindo(a) 😊 Aqui é da [Nome da Clínica]. Estou aqui para te ajudar a dar o primeiro passo em direção ao seu tratamento. Me conta: o que o(a) senhor(a) procura? Como posso te ajudar?
```

**Step 4 — Perguntas de qualificação** (4 perguntas, sem mídia)
1. O que o(a) senhor(a) procura? Como posso te ajudar?
2. Há quanto tempo o(a) senhor(a) está nessa situação?
3. Sente dor por causa dessa situação?
4. Essa situação te impede de tirar fotos ou sorrir com naturalidade?

**Step 5 — Objeções + followup + anti-ban**
Objeções sugeridas:
- "Tá caro" → "Quem pode avaliar uma condição especial para o seu caso é o próprio Dr. responsável, na consulta. Posso te ajudar a agendar? 😊"
- "Quero saber o preço antes" → "Para o Dr. avaliar o valor certinho, ele precisa ver o exame de imagem e olhar em boca. Na avaliação presencial fazemos isso sem custo 😊"
- "Não posso ir agora" → "Entendo! Me conta o que está dificultando — quem sabe consigo encaixar em um horário melhor 😊"
- "Quero cancelar" → "Puxa, que pena! Aconteceu algo? Podemos remarcar para um dia melhor 😊"

Followup: ativado, start na msg 3, máximo 3, intervalo 120min

**Step 6 — Transferência + LLM**
- Número de transferência: WhatsApp do atendimento humano da clínica
- Trigger: **after_all_questions**
- Template do resumo: incluir nome, telefone, as 4 respostas, e flag se é caso de exame/aposentado
- LLM: **Claude sonnet** (já default)

### Parte 2 — Integração Ecuro (precisa código + credenciais)

A integração Ecuro requer:
- Edge function `ecuro-availability` — busca horários disponíveis
- Edge function `ecuro-schedule` — confirma agendamento
- Tool calling no `process-message` para o LLM consultar/agendar via Ecuro

**Eu preciso de:**
1. URL base da API Ecuro
2. Tipo de autenticação (API key, OAuth, etc.)
3. Endpoints de "listar disponibilidade" e "criar agendamento" (ou link da doc)

Sem isso a IA seguirá o fluxo de qualificação e transferirá para humano no agendamento (que é o fallback seguro).

### Recomendação
Faça você o cadastro do agente pelo wizard (5min, todos os campos prontos acima). Quando tiver as credenciais Ecuro, abra um novo chat com a documentação da API e eu implemento a integração de agendamento automatizado.

