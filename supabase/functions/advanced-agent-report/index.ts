import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Msg { role: string; content: string; created_at: string }
interface Conv {
  id: string;
  contact_name: string | null;
  contact_number: string | null;
  status: string | null;
  agent_paused: boolean | null;
  created_at: string;
  last_message_at: string | null;
  messages: Msg[];
  has_appointment: boolean;
}

function maskName(n: string | null, number: string | null): string {
  if (n && n.trim()) {
    const parts = n.trim().split(/\s+/);
    const first = parts[0];
    const rest = parts.slice(1).map(p => p[0]?.toUpperCase() + ".").join(" ");
    return rest ? `${first} ${rest}` : first;
  }
  if (number) {
    const d = number.replace(/\D/g, "");
    if (d.length >= 4) return `Lead ****${d.slice(-4)}`;
  }
  return "Lead";
}

function sampleConversations(convs: Conv[]): Conv[] {
  const withAppt = convs.filter(c => c.has_appointment);
  const transferred = convs.filter(c => c.status === "transferred" && !c.has_appointment);
  const lost = convs.filter(c => !c.has_appointment && c.status !== "transferred" && c.messages.length >= 3);
  const longConvs = [...convs].sort((a, b) => b.messages.length - a.messages.length).slice(0, 8);

  const pick = <T,>(arr: T[], n: number): T[] => {
    if (arr.length <= n) return arr;
    const step = Math.max(1, Math.floor(arr.length / n));
    const out: T[] = [];
    for (let i = 0; i < arr.length && out.length < n; i += step) out.push(arr[i]);
    return out;
  };

  const seen = new Set<string>();
  const result: Conv[] = [];
  for (const c of [...pick(withAppt, 15), ...pick(transferred, 10), ...pick(lost, 10), ...longConvs]) {
    if (!seen.has(c.id)) { seen.add(c.id); result.push(c); }
  }
  return result.slice(0, 40);
}

function convToTranscript(c: Conv): string {
  const tag = c.has_appointment ? "[AGENDOU]" : c.status === "transferred" ? "[TRANSFERIDA]" : "[PERDIDA/ABANDONOU]";
  const header = `${tag} contato=${maskName(c.contact_name, c.contact_number)} msgs=${c.messages.length}`;
  const lines = c.messages.slice(0, 40).map(m => {
    const who = m.role === "user" ? "LEAD" : m.role === "assistant" ? "IA" : m.role.toUpperCase();
    const txt = (m.content || "").replace(/\s+/g, " ").trim().slice(0, 500);
    return `${who}: ${txt}`;
  });
  return `### ${header}\n${lines.join("\n")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const agentId: string = body.agentId;
    if (!agentId) {
      return new Response(JSON.stringify({ error: "agentId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: agent } = await admin.from("agents").select("id, name, user_id").eq("id", agentId).maybeSingle();
    if (!agent) {
      return new Response(JSON.stringify({ error: "Agent not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch conversations
    const { data: convsRaw } = await admin
      .from("conversations")
      .select("id, contact_name, contact_number, status, agent_paused, created_at, last_message_at")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(500);

    const convIds = (convsRaw ?? []).map((c: any) => c.id);

    // Fetch all messages for those conversations
    const { data: msgsRaw } = await admin
      .from("messages")
      .select("conversation_id, role, content, created_at")
      .in("conversation_id", convIds.length ? convIds : ["00000000-0000-0000-0000-000000000000"])
      .order("created_at", { ascending: true })
      .limit(20000);

    const { data: apptsRaw } = await admin
      .from("appointments")
      .select("conversation_id, start_time, status")
      .eq("agent_id", agentId)
      .limit(2000);

    const apptConvIds = new Set((apptsRaw ?? []).map((a: any) => a.conversation_id).filter(Boolean));
    const msgsByConv = new Map<string, Msg[]>();
    for (const m of msgsRaw ?? []) {
      const k = (m as any).conversation_id;
      if (!msgsByConv.has(k)) msgsByConv.set(k, []);
      msgsByConv.get(k)!.push({ role: (m as any).role, content: (m as any).content ?? "", created_at: (m as any).created_at });
    }

    const convs: Conv[] = (convsRaw ?? []).map((c: any) => ({
      ...c,
      messages: msgsByConv.get(c.id) ?? [],
      has_appointment: apptConvIds.has(c.id),
    }));

    // KPIs
    const uniqueContacts = new Set(convs.map(c => c.contact_number ?? c.id)).size;
    const total = convs.length;
    const transferred = convs.filter(c => c.status === "transferred").length;
    const paused = convs.filter(c => c.agent_paused).length;
    const appointments = apptsRaw?.length ?? 0;
    const lost = convs.filter(c => !c.has_appointment && c.status !== "transferred" && (c.messages.length >= 2)).length;
    const totalMessages = (msgsRaw ?? []).length;
    const inbound = (msgsRaw ?? []).filter((m: any) => m.role === "user").length;
    const outbound = totalMessages - inbound;
    const avgMsgsPerConv = total > 0 ? Math.round(totalMessages / total) : 0;
    const resolutionPct = total > 0 ? Math.round(((appointments + transferred) / total) * 100) : 0;

    // Horário de pico (por hora do dia, mensagens inbound)
    const hourBuckets = new Array(24).fill(0);
    for (const m of msgsRaw ?? []) {
      if ((m as any).role !== "user") continue;
      const d = new Date((m as any).created_at);
      hourBuckets[d.getUTCHours() - 3 < 0 ? d.getUTCHours() - 3 + 24 : d.getUTCHours() - 3]++; // approx BRT
    }
    const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));

    const firstDate = convs.length ? convs[convs.length - 1].created_at : null;
    const lastDate = convs.length ? (convs[0].last_message_at ?? convs[0].created_at) : null;

    // Sample
    const sample = sampleConversations(convs);
    const transcripts = sample.map(convToTranscript).join("\n\n").slice(0, 120000);

    const systemPrompt = `Você é um analista sênior de operações de atendimento via WhatsApp com IA. Sua tarefa é analisar transcrições reais de um agente de IA e produzir um diagnóstico executivo honesto, específico e acionável — em português do Brasil.

Você DEVE responder APENAS com um JSON válido seguindo EXATAMENTE este schema (sem markdown, sem comentários):

{
  "resumo_executivo": "string (4-6 frases, tom executivo, mostra valor concreto entregue pela IA)",
  "pontos_fortes": [ { "titulo": "string", "descricao": "string (1-2 frases)" } ],
  "pontos_fracos": [ { "titulo": "string", "descricao": "string", "impacto": "alto|medio|baixo" } ],
  "top_objecoes": [ { "objecao": "string curta", "frequencia_estimada": "string ex: '~30% dos leads'", "como_ia_responde": "string", "sugestao": "string" } ],
  "faqs_recorrentes": [ { "pergunta": "string", "sugestao_resposta_automatica": "string" } ],
  "exemplos_bons": [ { "contexto": "string curta", "por_que_funcionou": "string" } ],
  "exemplos_ruins": [ { "contexto": "string curta", "o_que_faltou": "string", "correcao_sugerida": "string" } ],
  "recomendacoes": [ { "acao": "string clara", "prioridade": "alta|media|baixa", "impacto_esperado": "string" } ],
  "proximos_passos_comerciais": [ "string ação para evoluir o serviço com o cliente" ]
}

Regras:
- pontos_fortes: 3-5 itens
- pontos_fracos: 3-5 itens
- top_objecoes: 3-5 itens
- faqs_recorrentes: 3-6 itens
- exemplos_bons: 2-3 itens
- exemplos_ruins: 2-3 itens
- recomendacoes: 4-7 itens
- proximos_passos_comerciais: 3-5 itens
- Seja específico (cite padrões reais que viu). Nunca invente números absolutos — use estimativas qualitativas ("a maioria", "~X%").
- Não cite nomes ou telefones de leads.
- Tom profissional, direto, sem floreios.`;

    const userPrompt = `AGENTE: ${agent.name}
PERÍODO: ${firstDate?.slice(0,10)} a ${lastDate?.slice(0,10)}

NÚMEROS GERAIS (já calculados):
- Conversas: ${total}
- Contatos únicos: ${uniqueContacts}
- Agendamentos gerados: ${appointments}
- Transferidas pela IA: ${transferred}
- Pausadas: ${paused}
- Taxa de resolução IA: ${resolutionPct}%
- Total de mensagens trocadas: ${totalMessages} (inbound: ${inbound}, outbound: ${outbound})
- Média de mensagens por conversa: ${avgMsgsPerConv}

AMOSTRA ESTRATIFICADA DE ${sample.length} CONVERSAS (já rotuladas com [AGENDOU], [TRANSFERIDA] ou [PERDIDA/ABANDONOU]):

${transcripts}

Analise e devolva o JSON conforme o schema definido.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error", aiRes.status, errText);
      return new Response(JSON.stringify({ error: "AI gateway error", status: aiRes.status, detail: errText }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let analysis: any;
    try { analysis = JSON.parse(content); } catch {
      const match = content.match(/\{[\s\S]*\}/);
      analysis = match ? JSON.parse(match[0]) : {};
    }

    return new Response(JSON.stringify({
      agent: { id: agent.id, name: agent.name },
      period: { from: firstDate, to: lastDate },
      kpis: {
        total_conversas: total,
        contatos_unicos: uniqueContacts,
        agendamentos: appointments,
        transferidas: transferred,
        pausadas: paused,
        perdidas_estim: lost,
        taxa_resolucao_pct: resolutionPct,
        total_mensagens: totalMessages,
        msgs_inbound: inbound,
        msgs_outbound: outbound,
        media_msgs_por_conversa: avgMsgsPerConv,
        horario_pico_brt: peakHour,
        amostra_analisada: sample.length,
      },
      analysis,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("advanced-agent-report error", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
