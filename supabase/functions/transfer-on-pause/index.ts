import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const normalizePhone = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

const buildTransferCandidates = (rawNumber: string) => {
  const digits = normalizePhone(rawNumber);
  const candidates = new Set<string>();
  const add = (value: string | null | undefined) => {
    const n = normalizePhone(value);
    if (n.length >= 10 && n.length <= 13) candidates.add(n);
  };
  const addBR = (national: string, withCC: boolean) => {
    if (national.length !== 10 && national.length !== 11) return;
    const ddd = national.slice(0, 2);
    const local = national.slice(2);
    const compose = (l: string) => withCC ? `55${ddd}${l}` : `${ddd}${l}`;
    add(compose(local));
    if (local.length === 9 && local.startsWith("9")) add(compose(local.slice(1)));
    if (local.length === 8) add(compose(`9${local}`));
  };
  add(digits);
  if (digits.startsWith("55")) {
    const nat = digits.slice(2);
    addBR(nat, true); addBR(nat, false);
  } else {
    addBR(digits, false); addBR(digits, true);
  }
  return Array.from(candidates);
};

const readExistsFlag = (text: string) => {
  try {
    const p = JSON.parse(text);
    if (typeof p?.exists === "boolean") return p.exists;
    if (typeof p?.response?.message?.[0]?.exists === "boolean") return p.response.message[0].exists;
  } catch (_) { return null; }
  return null;
};

async function generateConversationSummary(messages: any[]): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const transcript = messages
    .map((m: any) => `${m.role === "user" ? "Lead" : "Agente"}: ${m.content || ""}`)
    .join("\n");

  if (!apiKey) {
    return transcript.split("\n").slice(-10).join("\n");
  }

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Você resume conversas de WhatsApp em pt-BR. Seja objetivo." },
          { role: "user", content: `Resuma esta conversa em até 6 linhas destacando: interesse do lead, principais dores/objeções, dados coletados e próximo passo sugerido.\n\n${transcript}` },
        ],
      }),
    });
    if (!res.ok) {
      console.error("Summary AI error", res.status, await res.text());
      return transcript.split("\n").slice(-10).join("\n");
    }
    const json = await res.json();
    return json.choices?.[0]?.message?.content?.trim() || transcript.split("\n").slice(-10).join("\n");
  } catch (e) {
    console.error("Summary error", e);
    return transcript.split("\n").slice(-10).join("\n");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { conversation_id } = await req.json();
    if (!conversation_id) {
      return new Response(JSON.stringify({ error: "conversation_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: conv } = await supabase
      .from("conversations")
      .select("*, agents(*, agent_config(*), devices(*))")
      .eq("id", conversation_id)
      .single();

    if (!conv) {
      return new Response(JSON.stringify({ error: "conversation not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (conv.status === "transferred") {
      return new Response(JSON.stringify({ ok: true, skipped: "already_transferred" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const agent: any = conv.agents;
    const config: any = agent?.agent_config?.[0];
    const device: any = Array.isArray(agent?.devices) ? agent.devices[0] : agent?.devices;

    if ((agent?.transfer_trigger || "after_all_questions") !== "on_pause") {
      return new Response(JSON.stringify({ ok: true, skipped: "trigger_not_on_pause" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!agent?.transfer_number || !device) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_transfer_number_or_device" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: msgs } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true });

    const userMessages = (msgs || []).filter((m: any) => m.role === "user");
    const questions = (config?.qualification_questions as any[]) || [];

    let perguntasRespostas = "";
    questions.forEach((q: any, i: number) => {
      const offset = agent.type === "prospecting" ? 1 : 0;
      const ans = userMessages[i + offset];
      perguntasRespostas += `*${i + 1}. ${q.question}*\n→ ${ans?.content || "Não respondida"}\n`;
    });

    const template = config?.transfer_summary_template;
    let summary: string;
    const needSummary = !template || template.includes("{{resumo_conversa}}");
    const resumoConversa = needSummary ? await generateConversationSummary(msgs || []) : "";

    if (template) {
      summary = template
        .replace(/\{\{nome_contato\}\}/g, conv.contact_name || "Não informado")
        .replace(/\{\{telefone\}\}/g, conv.contact_number || "")
        .replace(/\{\{data\}\}/g, new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }))
        .replace(/\{\{agente\}\}/g, agent.name || "")
        .replace(/\{\{resumo_conversa\}\}/g, resumoConversa);
      questions.forEach((q: any, i: number) => {
        const num = i + 1;
        const offset = agent.type === "prospecting" ? 1 : 0;
        const ans = userMessages[i + offset];
        summary = summary
          .replace(new RegExp(`\\{\\{pergunta_${num}\\}\\}`, "g"), q.question || "")
          .replace(new RegExp(`\\{\\{resposta_${num}\\}\\}`, "g"), ans?.content || "Não respondida");
      });
      summary = summary.replace(/\{\{perguntas_respostas\}\}/g, perguntasRespostas.trim());
    } else {
      summary = `*Atendimento pausado — transferência* ⏸️\n\n`;
      summary += `*Nome:* ${conv.contact_name || "Não informado"}\n`;
      summary += `*Telefone:* ${conv.contact_number}\n`;
      summary += `*Data:* ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n`;
      summary += `*Agente:* ${agent.name}\n\n`;
      summary += `*Resumo da conversa:*\n${resumoConversa}\n\n`;
      if (perguntasRespostas) summary += `*Respostas do lead:*\n${perguntasRespostas}`;
    }

    let evoUrl = device.evolution_api_url.replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(evoUrl)) evoUrl = `https://${evoUrl}`;
    const evoKey = device.evolution_api_key;
    const evoInstance = device.instance_name;

    const candidates = buildTransferCandidates(agent.transfer_number);
    let success = false;
    for (const num of candidates) {
      const r = await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evoKey || "" },
        body: JSON.stringify({ number: num, text: summary }),
      });
      const txt = await r.text();
      const exists = readExistsFlag(txt);
      console.log(`transfer-on-pause try ${num}: status=${r.status} exists=${exists}`);
      if (r.ok && exists !== false) { success = true; break; }
    }

    if (success) {
      await supabase.from("conversations").update({ status: "transferred" }).eq("id", conversation_id);
    }

    return new Response(JSON.stringify({ ok: true, transferred: success }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("transfer-on-pause error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
