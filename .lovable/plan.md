

## Ajuste: Seleção de clínica + especialidade no Wizard

### Mudança no plano original

A integração Ecuro já previa selecionar `clinic_id` e `specialty_id` na UI, mas vou deixar explícito como funciona quando há **múltiplas clínicas**.

### UI no Wizard (novo Step 7 "Integrações" ou card no Step 6)

**Card "Agendamento Ecuro"**
1. **Switch** "Ativar agendamento via Ecuro"
2. Ao ativar, chama `ecuro-list-clinics` (edge function proxy) e popula:
   - **Select de clínica** (obrigatório) — lista todas as clínicas retornadas pela API com nome + cidade/identificador para diferenciar
3. Ao escolher clínica, chama `ecuro-list-specialties?clinicId=...` e popula:
   - **Select de especialidade default** (obrigatório) — ex: "Implantodontia", "Avaliação"
4. **Input duração** (minutos, default 30)

Tudo é salvo em `agent_integrations.config`:
```json
{
  "clinic_id": "uuid-da-clinica-escolhida",
  "clinic_name": "Unidade Centro",
  "specialty_id": "uuid-especialidade",
  "specialty_name": "Avaliação",
  "default_duration": 30
}
```

### Como a IA usa em runtime

As tools `get_availability` e `schedule_appointment` no `process-message` leem `agent_integrations.config` do agente e injetam **automaticamente** `clinic_id` + `specialty_id` nas chamadas Ecuro. A IA **não escolhe clínica** — é fixa por agente.

### Recomendação para múltiplas clínicas

**1 agente = 1 clínica.** Se a clínica Eva tem 3 unidades, você cria 3 agentes (Eva-Centro, Eva-Norte, Eva-Sul), cada um com seu próprio dispositivo WhatsApp e sua própria `clinic_id` configurada. Isso é mais limpo que tentar a IA decidir a unidade no meio da conversa.

Se quiser **1 agente atendendo múltiplas clínicas** (ex: lead escolhe a unidade na conversa), me avise — exige mudar a tool `get_availability` para aceitar `clinic_id` como parâmetro e adicionar uma tool `list_clinics` para a IA oferecer opções ao lead. Mais complexo e propenso a erro.

### Resto do plano sem alteração

Migration `agent_integrations`, secret `ECURO_API_TOKEN`, edge functions (`ecuro-list-clinics`, `ecuro-list-specialties`, `ecuro-availability`, `ecuro-schedule`) e tool calling no `process-message` permanecem iguais.

### Pergunta antes de implementar

Confirma o modelo **1 agente por clínica** (recomendado) ou quer **1 agente multi-clínica** com o lead escolhendo a unidade?

