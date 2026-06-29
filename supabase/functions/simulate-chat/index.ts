import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeDeepseekModel(model?: string | null): string {
  if (!model) return "deepseek-chat";
  const m = model.toLowerCase().trim();
  if (m === "deepseek-chat" || m === "deepseek-reasoner") return m;
  if (m.includes("reason") || m === "deepseek-r1") return "deepseek-reasoner";
  return "deepseek-chat";
}

function normalizeOpenAIModel(model?: string | null): string {
  if (!model || !model.trim()) return "gpt-4o-mini";
  return model;
}

const ECURO_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_availability",
      description: "Buscar horários disponíveis nos próximos 7 dias para a clínica e especialidade configuradas. Use ANTES de propor qualquer horário ao paciente.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Data inicial YYYY-MM-DD (opcional)" },
          end_date: { type: "string", description: "Data final YYYY-MM-DD (opcional)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_appointment",
      description: "Criar o agendamento depois que o paciente confirmar um horário específico retornado por get_availability.",
      parameters: {
        type: "object",
        required: ["start_time", "patient_name"],
        properties: {
          start_time: { type: "string", description: "ISO 8601 do horário escolhido (use o valor exato retornado por get_availability)" },
          end_time: { type: "string", description: "ISO 8601 do término (opcional)" },
          patient_name: { type: "string", description: "Nome do paciente" },
          patient_cpf: { type: "string" },
          patient_email: { type: "string" },
          patient_birthdate: { type: "string", description: "YYYY-MM-DD (opcional)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_nearest_unit",
      description: "Buscar a unidade da rede mais próxima a partir de um bairro, cidade ou nome de unidade mencionado pelo paciente. Use SEMPRE que o paciente perguntar sobre outras unidades, localização, se tem unidade em algum bairro/cidade, ou disser onde mora. NUNCA invente unidades, telefones ou links de Maps — use só o que esta ferramenta retornar.",
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", description: "Bairro, cidade ou nome da unidade mencionado pelo paciente" },
        },
      },
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { messages, agent_id, simulation_mode } = body;
    const mode: "real" | "dryrun" | "off" = simulation_mode === "real" ? "real" : simulation_mode === "dryrun" ? "dryrun" : "off";

    if (!agent_id) {
      return new Response(JSON.stringify({ error: "agent_id é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authenticate caller and verify ownership of the agent
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load full agent (with secrets) and verify owner
    const { data: agentRow } = await supabase
      .from("agents")
      .select("id, user_id, prompt_compiled, llm_provider, llm_model, llm_api_key")
      .eq("id", agent_id)
      .maybeSingle();
    if (!agentRow || agentRow.user_id !== userData.user.id) {
      return new Response(JSON.stringify({ error: "agent not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt: string = agentRow.prompt_compiled || body.prompt || "";
    const llm_provider: string = agentRow.llm_provider || "claude";
    const llm_model: string | null = agentRow.llm_model;
    const llm_api_key: string | null = agentRow.llm_api_key;

    // Detect Ecuro integration
    let ecuroEnabled = false;
    if (mode !== "off") {
      const { data: integ } = await supabase
        .from("agent_integrations")
        .select("enabled")
        .eq("agent_id", agent_id)
        .eq("provider", "ecuro")
        .maybeSingle();
      ecuroEnabled = !!integ?.enabled;
    }

    const tools = ecuroEnabled ? ECURO_TOOLS : undefined;
    const toolLog: Array<{ name: string; mode: string; args: any; result: any }> = [];

    async function runTool(name: string, args: any) {
      const supaUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      try {
        if (name === "get_availability") {
          // get_availability é seguro chamar real em ambos os modos
          const r = await fetch(`${supaUrl}/functions/v1/ecuro-availability`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ agent_id, ...args }),
          });
          return await r.json();
        }
        if (name === "schedule_appointment") {
          if (mode === "dryrun") {
            return {
              ok: true,
              dryrun: true,
              message: "[DRY-RUN] Agendamento NÃO foi criado na Ecuro. Em produção seria criado com estes dados.",
              would_send: { agent_id, ...args },
            };
          }
          // real
          const r = await fetch(`${supaUrl}/functions/v1/ecuro-schedule`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ agent_id, patient_phone: args.patient_phone || "5500000000000", ...args }),
          });
          return await r.json();
        }
        if (name === "find_nearest_unit") {
          const r = await fetch(`${supaUrl}/functions/v1/find-nearest-unit`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ query: args?.query || "" }),
          });
          return await r.json();
        }
        return { error: "unknown tool" };
      } catch (e) {
        return { error: String(e) };
      }
    }

    const nowBR = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date());
    const dateNote = `\n\nDATA E HORA ATUAL (America/Sao_Paulo): ${nowBR}.\nNUNCA invente datas. Para agendamentos, use SOMENTE as datas/labels retornados por get_availability — não calcule sozinho.`;

    const allMessages = [
      { role: "system", content: (prompt || "") + dateNote },
      ...messages,
    ];

    const provider = llm_provider || "claude";
    console.log(`[simulate-chat] provider=${provider} model=${llm_model} hasKey=${!!llm_api_key} mode=${mode} ecuro=${ecuroEnabled}`);

    let aiResponse = "";

    // Helper: chat completions loop with tool support
    async function chatLoop(endpoint: string, headers: Record<string, string>, model: string): Promise<string> {
      const conv = [...allMessages];
      for (let iter = 0; iter < 4; iter++) {
        const body: any = { model, messages: conv, stream: false };
        if (tools) { body.tools = tools; body.tool_choice = "auto"; }
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const text = await res.text();
        if (!res.ok) {
          if (res.status === 429) throw new Error("Rate limit excedido. Tente novamente em instantes.");
          if (res.status === 402) throw new Error("Créditos esgotados na Lovable AI.");
          throw new Error(`AI ${res.status}: ${text.slice(0, 500)}`);
        }
        const data = JSON.parse(text);
        const choice = data.choices?.[0]?.message;
        const toolCalls = choice?.tool_calls;
        if (toolCalls && toolCalls.length > 0) {
          conv.push({ role: "assistant", content: choice.content || "", tool_calls: toolCalls } as any);
          for (const tc of toolCalls) {
            let parsedArgs: any = {};
            try { parsedArgs = JSON.parse(tc.function?.arguments || "{}"); } catch {}
            const toolResult = await runTool(tc.function?.name, parsedArgs);
            console.log(`[simulate-chat] tool ${tc.function?.name} (${mode}) →`, JSON.stringify(toolResult).substring(0, 300));
            toolLog.push({ name: tc.function?.name, mode, args: parsedArgs, result: toolResult });
            conv.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify(toolResult),
            } as any);
          }
          continue;
        }
        return choice?.content || "";
      }
      return "";
    }

    if (provider === "deepseek") {
      if (!llm_api_key) {
        return new Response(JSON.stringify({ error: "DeepSeek API key não configurada no agente." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const model = normalizeDeepseekModel(llm_model);
      aiResponse = await chatLoop("https://api.deepseek.com/v1/chat/completions", { Authorization: `Bearer ${llm_api_key}` }, model);
    } else if (provider === "openai") {
      if (!llm_api_key) {
        return new Response(JSON.stringify({ error: "OpenAI API key não configurada no agente." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const model = normalizeOpenAIModel(llm_model);
      aiResponse = await chatLoop("https://api.openai.com/v1/chat/completions", { Authorization: `Bearer ${llm_api_key}` }, model);
    } else {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      aiResponse = await chatLoop(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        { Authorization: `Bearer ${LOVABLE_API_KEY}` },
        "google/gemini-2.5-flash",
      );
    }

    if (!aiResponse) {
      return new Response(JSON.stringify({ error: "LLM retornou resposta vazia.", tool_log: toolLog }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ response: aiResponse, tool_log: toolLog, simulation_mode: mode, ecuro_enabled: ecuroEnabled }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Simulate chat error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
