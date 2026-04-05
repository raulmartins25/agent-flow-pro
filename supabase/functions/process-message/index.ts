import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { conversation_id, agent, history, contact_number, device_id } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (!agent?.prompt_compiled) {
      return new Response(JSON.stringify({ error: "No prompt configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch agent with config and device
    const { data: agentFull } = await supabase
      .from("agents")
      .select("*, agent_config(*), devices(*)")
      .eq("id", agent.id)
      .single();

    const config = agentFull?.agent_config?.[0] || null;
    const device = agentFull?.devices || null;

    if (!device) {
      return new Response(JSON.stringify({ error: "No device linked to agent" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const evoUrl = device.evolution_api_url;
    const evoKey = device.evolution_api_key;
    const evoInstance = device.instance_name;

    // --- ANTI-BAN ---
    const lastUserMsg = [...history].reverse().find((m: any) => m.role === "user");
    if (lastUserMsg?.content && agentFull?.restrictions) {
      const banTriggers = ['para', 'stop', 'me tira', 'não quero', 'denuncia', 'spam', 'me bloqueia'];
      const msgLower = lastUserMsg.content.toLowerCase().trim();
      const isBanTrigger = banTriggers.some(trigger => msgLower === trigger || msgLower.startsWith(trigger + ' '));

      if (isBanTrigger) {
        await supabase
          .from("conversations")
          .update({ status: "closed" })
          .eq("id", conversation_id);

        const goodbyeMsg = "Entendido! Não enviaremos mais mensagens. Se precisar de algo no futuro, é só chamar. 👋";
        await supabase.from("messages").insert({
          conversation_id,
          role: "assistant",
          content: goodbyeMsg,
        });

        await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evoKey || "" },
          body: JSON.stringify({ number: contact_number, text: goodbyeMsg }),
        });

        return new Response(JSON.stringify({ ok: true, action: "closed_ban" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // --- Build system prompt ---
    let systemPrompt = agent.prompt_compiled;

    if (agentFull?.type === "prospecting") {
      const userMessages = history.filter((m: any) => m.role === "user");
      if (userMessages.length === 1) {
        systemPrompt += `\n\nINSTRUÇÃO PARA ESTA RESPOSTA:
O lead acabou de responder sua mensagem de disparo pela primeira vez.
Responda de forma natural e calorosa, mostrando que leu a resposta dele.
Demonstre interesse genuíno antes de iniciar as perguntas de qualificação.
Não comece com "Que ótimo!" ou "Perfeito!" — seja mais natural e específico à resposta dele.`;
      }
    }

    // --- Generate AI response ---
    const messages = [
      { role: "system", content: systemPrompt },
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
      // Map deprecated model names to current ones
      const modelMap: Record<string, string> = {
        "deepseek-v3": "deepseek-chat",
        "deepseek-v2": "deepseek-chat",
      };
      const requestedModel = agent.llm_model || "deepseek-chat";
      const actualModel = modelMap[requestedModel] || requestedModel;
      console.log(`DeepSeek: requested=${requestedModel}, using=${actualModel}`);

      const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${agent.llm_api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: actualModel, messages }),
      });
      const resText = await res.text();
      console.log(`DeepSeek API: status=${res.status}, body=${resText.substring(0, 500)}`);
      if (!res.ok) {
        throw new Error(`DeepSeek API error ${res.status}: ${resText.substring(0, 300)}`);
      }
      const data = JSON.parse(resText);
      aiResponse = data.choices?.[0]?.message?.content || "";
    }

    if (!aiResponse) {
      console.error(`Empty AI response. Provider=${agent.llm_provider}, Model=${agent.llm_model}`);
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- SEND_MEDIA detection ---
    const mediaRegex = /SEND_MEDIA:([a-f0-9-]+)/gi;
    const mediaMatches = [...aiResponse.matchAll(mediaRegex)];
    let cleanResponse = aiResponse.replace(mediaRegex, "").replace(/\s{2,}/g, " ").trim();

    for (const match of mediaMatches) {
      const questionId = match[1];
      if (!config?.qualification_questions) continue;

      const qList = config.qualification_questions as any[];
      const question = qList.find((q: any) => q.id === questionId);
      if (!question?.media?.file_url) continue;

      const media = question.media;

      try {
        if (media.file_type === "audio") {
          await fetch(`${evoUrl}/message/sendWhatsAppAudio/${evoInstance}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoKey || "" },
            body: JSON.stringify({ number: contact_number, audio: media.file_url }),
          });
        } else {
          await fetch(`${evoUrl}/message/sendMedia/${evoInstance}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoKey || "" },
            body: JSON.stringify({
              number: contact_number,
              mediatype: media.file_type,
              media: media.file_url,
              ...(media.file_type === "document" ? { fileName: media.file_name } : {}),
            }),
          });
        }

        await supabase.from("messages").insert({
          conversation_id,
          role: "assistant",
          media_url: media.file_url,
          media_type: media.file_type,
          content: media.offer_message || null,
        });
      } catch (mediaErr) {
        console.error("Error sending media:", mediaErr);
      }
    }

    // Save AI text response
    if (cleanResponse) {
      await supabase.from("messages").insert({
        conversation_id,
        role: "assistant",
        content: cleanResponse,
      });

      // Send text via Evolution API
      await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evoKey || "" },
        body: JSON.stringify({ number: contact_number, text: cleanResponse }),
      });
    }

    // --- TRANSFER CHECK ---
    if (config?.qualification_questions && agentFull?.transfer_number) {
      const qList = config.qualification_questions as any[];
      const userMessages = history.filter((m: any) => m.role === "user");
      const transferTrigger = agentFull.transfer_trigger || "after_all_questions";

      if (transferTrigger === "after_all_questions" && userMessages.length >= qList.length && qList.length > 0) {
        let summary = (config.transfer_summary_template || "📋 Resumo do Lead\n\n{{perguntas_respostas}}")
          .replace("{{nome_contato}}", contact_number)
          .replace("{{telefone}}", contact_number)
          .replace("{{data}}", new Date().toLocaleDateString("pt-BR"));

        const qaPairs = qList.map((q: any, i: number) => {
          const answer = userMessages[i]?.content || "—";
          return `❓ ${q.question}\n💬 ${answer}`;
        }).join("\n\n");
        summary = summary.replace("{{perguntas_respostas}}", qaPairs);

        await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evoKey || "" },
          body: JSON.stringify({ number: agentFull.transfer_number, text: summary }),
        });

        await supabase
          .from("conversations")
          .update({ status: "transferred" })
          .eq("id", conversation_id);
      }
    }

    return new Response(JSON.stringify({ ok: true, response: cleanResponse || aiResponse }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Process message error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
