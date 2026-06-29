import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AGENT_ID = "9d01e0ff-9bf3-4fe5-8979-cd10e692ec6e";
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TOOLS = [
  { type: "function", function: { name: "get_availability", description: "Buscar horários disponíveis", parameters: { type: "object", properties: { start_date: { type: "string" }, end_date: { type: "string" } } } } },
  { type: "function", function: { name: "schedule_appointment", description: "Criar agendamento", parameters: { type: "object", required: ["start_time", "patient_name"], properties: { start_time: { type: "string" }, end_time: { type: "string" }, patient_name: { type: "string" }, patient_cpf: { type: "string" }, patient_email: { type: "string" }, patient_birthdate: { type: "string" } } } } },
  { type: "function", function: { name: "find_nearest_unit", description: "Buscar unidade da rede por bairro/cidade/nome.", parameters: { type: "object", required: ["query"], properties: { query: { type: "string" } } } } },
];

async function runTool(name: string, args: any) {
  if (name === "find_nearest_unit") {
    const r = await fetch(`${SUPA_URL}/functions/v1/find-nearest-unit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SRK}` },
      body: JSON.stringify({ query: args?.query || "" }),
    });
    return await r.json();
  }
  if (name === "get_availability") {
    const r = await fetch(`${SUPA_URL}/functions/v1/ecuro-availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SRK}` },
      body: JSON.stringify({ agent_id: AGENT_ID, ...args }),
    });
    return await r.json();
  }
  if (name === "schedule_appointment") {
    return { ok: true, dryrun: true, would_send: args };
  }
  return { error: "unknown" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = createClient(SUPA_URL, SRK);
  const { data: agent } = await sb.from("agents").select("prompt_compiled, llm_model").eq("id", AGENT_ID).single();
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return new Response(JSON.stringify({ error: "no key" }), { status: 500, headers: corsHeaders });

  const nowBR = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());
  const sysPrompt = (agent!.prompt_compiled || "") + `\n\nDATA E HORA ATUAL (America/Sao_Paulo): ${nowBR}.\nNUNCA invente datas.`;

  const { user_message } = await req.json();

  const conv: any[] = [{ role: "system", content: sysPrompt }, { role: "user", content: user_message }];
  const toolLog: any[] = [];
  let finalContent = "";
  for (let i = 0; i < 6; i++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({ model: agent!.llm_model || "gpt-4.1-mini", messages: conv, tools: TOOLS, tool_choice: "auto", stream: false }),
    });
    const txt = await res.text();
    if (!res.ok) return new Response(JSON.stringify({ error: txt, tool_log: toolLog }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const data = JSON.parse(txt);
    const choice = data.choices?.[0]?.message;
    if (choice?.tool_calls?.length) {
      conv.push({ role: "assistant", content: choice.content || "", tool_calls: choice.tool_calls });
      for (const tc of choice.tool_calls) {
        let args: any = {}; try { args = JSON.parse(tc.function?.arguments || "{}"); } catch {}
        const result = await runTool(tc.function?.name, args);
        toolLog.push({ name: tc.function?.name, args, result });
        conv.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
      }
      continue;
    }
    finalContent = choice?.content || "";
    break;
  }
  return new Response(JSON.stringify({ response: finalContent, tool_log: toolLog }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
