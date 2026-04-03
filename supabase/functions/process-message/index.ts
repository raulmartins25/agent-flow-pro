import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { conversation_id, agent, history, contact_number, instance_name } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (!agent?.prompt_compiled) {
      return new Response(JSON.stringify({ error: "No prompt configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch agent config for ban_triggers and transfer settings
    const { data: agentFull } = await supabase
      .from("agents")
      .select("*, agent_config(*)")
      .eq("id", agent.id)
      .single();

    const config = agentFull?.agent_config?.[0] || null;

    // --- ANTI-BAN: Check last user message for ban triggers ---
    const lastUserMsg = [...history].reverse().find((m: any) => m.role === "user");
    if (lastUserMsg?.content && agentFull?.restrictions) {
      // Parse ban triggers from restrictions or use defaults
      const banTriggers = ['para', 'stop', 'me tira', 'não quero', 'denuncia', 'spam', 'me bloqueia'];
      const msgLower = lastUserMsg.content.toLowerCase().trim();
      const isBanTrigger = banTriggers.some(trigger => msgLower === trigger || msgLower.startsWith(trigger + ' '));

      if (isBanTrigger) {
        // Close conversation
        await supabase
          .from("conversations")
          .update({ status: "closed" })
          .eq("id", conversation_id);

        // Send goodbye message
        const goodbyeMsg = "Entendido! Não enviaremos mais mensagens. Se precisar de algo no futuro, é só chamar. 👋";
        await supabase.from("messages").insert({
          conversation_id,
          role: "assistant",
          content: goodbyeMsg,
        });

        // Send via Evolution API
        if (agentFull) {
          await fetch(`${agentFull.evolution_api_url}/message/sendText/${agentFull.evolution_instance}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: agentFull.evolution_api_key || "" },
            body: JSON.stringify({ number: contact_number, text: goodbyeMsg }),
          });
        }

        return new Response(JSON.stringify({ ok: true, action: "closed_ban" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // --- Generate AI response ---
    const messages = [
      { role: "system", content: agent.prompt_compiled },
      ...history.map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
    ];

    let aiResponse = "";

    if (agent.llm_provider === "claude") {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, stream: false }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(`AI gateway error ${res.status}: ${t}`); }
      const data = await res.json();
      aiResponse = data.choices?.[0]?.message?.content || "";
    } else if (agent.llm_provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${agent.llm_api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: agent.llm_model || "gpt-4o", messages }),
      });
      const data = await res.json();
      aiResponse = data.choices?.[0]?.message?.content || "";
    } else if (agent.llm_provider === "deepseek") {
      const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${agent.llm_api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: agent.llm_model || "deepseek-chat", messages }),
      });
      const data = await res.json();
      aiResponse = data.choices?.[0]?.message?.content || "";
    }

    if (!aiResponse) {
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save AI response
    await supabase.from("messages").insert({
      conversation_id,
      role: "assistant",
      content: aiResponse,
    });

    // Send via Evolution API
    if (agentFull) {
      await fetch(`${agentFull.evolution_api_url}/message/sendText/${agentFull.evolution_instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: agentFull.evolution_api_key || "" },
        body: JSON.stringify({ number: contact_number, text: aiResponse }),
      });
    }

    // --- TRANSFER CHECK: After all qualification questions answered ---
    if (config?.qualification_questions && agentFull?.transfer_number) {
      const qList = config.qualification_questions as any[];
      const userMessages = history.filter((m: any) => m.role === "user");
      const transferTrigger = agentFull.transfer_trigger || "after_all_questions";

      if (transferTrigger === "after_all_questions" && userMessages.length >= qList.length && qList.length > 0) {
        // Compile transfer summary
        let summary = (config.transfer_summary_template || "📋 Resumo do Lead\n\n{{perguntas_respostas}}")
          .replace("{{nome_contato}}", contact_number)
          .replace("{{telefone}}", contact_number)
          .replace("{{data}}", new Date().toLocaleDateString("pt-BR"));

        // Build Q&A pairs
        const qaPairs = qList.map((q: any, i: number) => {
          const answer = userMessages[i]?.content || "—";
          return `❓ ${q.question}\n💬 ${answer}`;
        }).join("\n\n");
        summary = summary.replace("{{perguntas_respostas}}", qaPairs);

        // Send summary to transfer number
        await fetch(`${agentFull.evolution_api_url}/message/sendText/${agentFull.evolution_instance}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: agentFull.evolution_api_key || "" },
          body: JSON.stringify({ number: agentFull.transfer_number, text: summary }),
        });

        // Mark conversation as transferred
        await supabase
          .from("conversations")
          .update({ status: "transferred" })
          .eq("id", conversation_id);
      }
    }

    return new Response(JSON.stringify({ ok: true, response: aiResponse }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Process message error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
