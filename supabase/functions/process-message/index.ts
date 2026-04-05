import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const normalizePhone = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

const buildTransferCandidates = (rawNumber: string) => {
  const digits = normalizePhone(rawNumber);
  const candidates = new Set<string>();

  const add = (value: string | null | undefined) => {
    const normalized = normalizePhone(value);
    if (normalized.length >= 10 && normalized.length <= 13) {
      candidates.add(normalized);
    }
  };

  const addBrazilianVariants = (nationalNumber: string, withCountryCode: boolean) => {
    if (nationalNumber.length !== 10 && nationalNumber.length !== 11) return;

    const ddd = nationalNumber.slice(0, 2);
    const local = nationalNumber.slice(2);
    const compose = (localNumber: string) => withCountryCode ? `55${ddd}${localNumber}` : `${ddd}${localNumber}`;

    add(compose(local));

    if (local.length === 9 && local.startsWith("9")) {
      add(compose(local.slice(1)));
    }

    if (local.length === 8) {
      add(compose(`9${local}`));
    }
  };

  add(digits);

  if (digits.startsWith("55")) {
    const national = digits.slice(2);
    addBrazilianVariants(national, true);
    addBrazilianVariants(national, false);
  } else {
    addBrazilianVariants(digits, false);
    addBrazilianVariants(digits, true);
  }

  return Array.from(candidates);
};

const readTransferExistsFlag = (payloadText: string) => {
  try {
    const parsed = JSON.parse(payloadText);

    if (typeof parsed?.exists === "boolean") {
      return parsed.exists;
    }

    if (typeof parsed?.response?.message?.[0]?.exists === "boolean") {
      return parsed.response.message[0].exists;
    }
  } catch (_) {
    return null;
  }

  return null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { conversation_id, agent, history, contact_number, device_id, contact_name } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (!agent?.prompt_compiled) {
      return new Response(JSON.stringify({ error: "No prompt configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: agentFull } = await supabase
      .from("agents")
      .select("*, agent_config(*), devices(*)")
      .eq("id", agent.id)
      .single();

    const config = agentFull?.agent_config?.[0] || null;
    const relatedDevice = agentFull?.devices;
    let device = Array.isArray(relatedDevice) ? relatedDevice[0] || null : relatedDevice || null;

    if (!device && device_id) {
      const { data: fallbackDevice } = await supabase
        .from("devices")
        .select("*")
        .eq("id", device_id)
        .maybeSingle();

      device = fallbackDevice || null;
    }

    if (!device) {
      return new Response(JSON.stringify({ error: "No device linked to agent" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const evoUrl = device.evolution_api_url;
    const evoKey = device.evolution_api_key;
    const evoInstance = device.instance_name;

    const lastUserMsg = [...history].reverse().find((m: any) => m.role === "user");
    if (lastUserMsg?.content && agentFull?.restrictions) {
      const banTriggers = ["para", "stop", "me tira", "não quero", "denuncia", "spam", "me bloqueia"];
      const msgLower = lastUserMsg.content.toLowerCase().trim();
      const isBanTrigger = banTriggers.some(trigger => msgLower === trigger || msgLower.startsWith(trigger + " "));

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

    let systemPrompt = agent.prompt_compiled;

    const contactName = contact_name || "Contato";
    systemPrompt += `\n\nINFORMAÇÃO DO CONTATO:
O nome do contato é: ${contactName} (obtido automaticamente do WhatsApp).
Use este nome para personalizar as mensagens de forma natural, mas NÃO pergunte o nome do lead.`;

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

    const messages = [
      { role: "system", content: systemPrompt },
      ...history
        .filter((m: any) => m.content && m.content.trim() !== "")
        .map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
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

    let shouldTransfer = aiResponse.includes("TRANSFER_LEAD");
    let cleanResponse = aiResponse.replace(/TRANSFER_LEAD/g, "").trim();

    // --- Programmatic transfer detection ---
    const questions = (config?.qualification_questions as any[]) || [];
    const userMessages = history.filter((m: any) => m.role === "user");
    const offset = agentFull?.type === "prospecting" ? 1 : 0;
    const answeredQuestions = userMessages.length - offset;
    const transferTrigger = agentFull?.transfer_trigger || "after_all_questions";

    console.log(`Transfer check: tokenBased=${shouldTransfer}, programmatic: answered=${answeredQuestions}/${questions.length}, trigger=${transferTrigger}, transfer_number=${agentFull?.transfer_number}`);

    if (!shouldTransfer && transferTrigger === "after_all_questions" 
        && questions.length > 0 && answeredQuestions >= questions.length 
        && agentFull?.transfer_number) {
      shouldTransfer = true;
      console.log("Transfer FORCED programmatically: all questions answered");
    }

    if (shouldTransfer && agentFull?.transfer_number && device) {
      console.log(`Enviando resumo para número de transferência: ${agentFull.transfer_number}`);
      console.log(`Transferência sairá pelo device do agente ativo: ${device.name} (${evoInstance})`);
      console.log(`NÃO para o lead: ${contact_number}`);
      const userMessages = history.filter((m: any) => m.role === "user");
      const questions = (config?.qualification_questions as any[]) || [];

      let perguntasRespostas = "";
      console.log(`Transfer mapping: ${questions.length} questions, ${userMessages.length} user messages, type=${agentFull.type}`);
      questions.forEach((q: any, index: number) => {
        const offset = agentFull.type === "prospecting" ? 1 : 0;
        const answer = userMessages[index + offset];
        console.log(`  Q${index + 1}: "${(q.question || "").substring(0, 50)}" → R: "${(answer?.content || "Não respondida").substring(0, 50)}" (msg index=${index + offset})`);
        perguntasRespostas += `*${index + 1}. ${q.question}*\n→ ${answer?.content || "Não respondida"}\n`;
      });

      const template = config?.transfer_summary_template;
      let summary: string;
      if (template) {
        summary = template
          .replace(/\{\{nome_contato\}\}/g, contactName)
          .replace(/\{\{telefone\}\}/g, contact_number)
          .replace(/\{\{data\}\}/g, new Date().toLocaleString("pt-BR"))
          .replace(/\{\{agente\}\}/g, agentFull.name || "");

        questions.forEach((q: any, index: number) => {
          const num = index + 1;
          const answer = userMessages[index + (agentFull.type === "prospecting" ? 1 : 0)];
          summary = summary
            .replace(new RegExp(`\\{\\{pergunta_${num}\\}\\}`, "g"), q.question || "")
            .replace(new RegExp(`\\{\\{resposta_${num}\\}\\}`, "g"), answer?.content || "Não respondida");
        });

        summary = summary.replace(/\{\{perguntas_respostas\}\}/g, perguntasRespostas.trim());
      } else {
        summary = `*Novo lead qualificado* ✅\n\n`;
        summary += `*Nome:* ${contactName}\n`;
        summary += `*Telefone:* ${contact_number}\n`;
        summary += `*Data:* ${new Date().toLocaleString("pt-BR")}\n`;
        summary += `*Agente:* ${agentFull.name}\n\n`;
        summary += `*Respostas do lead:*\n\n${perguntasRespostas}`;
      }
      console.log("Transfer summary:", summary.substring(0, 300));

      try {
        const transferNum = normalizePhone(agentFull.transfer_number);
        if (!transferNum) {
          throw new Error(`Invalid transfer number: ${agentFull.transfer_number}`);
        }

        const numbersToTry = buildTransferCandidates(agentFull.transfer_number);
        if (numbersToTry.length === 0) {
          throw new Error(`No valid transfer candidates for: ${agentFull.transfer_number}`);
        }

        console.log(`Transfer sender instance=${evoInstance}, candidates=${numbersToTry.join(", ")}`);

        let transferSuccess = false;
        let lastTransferResponse = "";

        for (const numToTry of numbersToTry) {
          console.log(`Trying transfer from ${evoInstance} to: ${numToTry}`);
          const transferRes = await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoKey || "" },
            body: JSON.stringify({ number: numToTry, text: summary }),
          });
          const transferResText = await transferRes.text();
          const existsFlag = readTransferExistsFlag(transferResText);
          lastTransferResponse = `status=${transferRes.status}, exists=${String(existsFlag)}, body=${transferResText.substring(0, 300)}`;
          console.log(`Evolution transfer response for ${numToTry}: ${lastTransferResponse}`);

          if (transferRes.ok && existsFlag !== false) {
            transferSuccess = true;
            console.log(`Transfer succeeded to: ${numToTry}`);
            break;
          }

          if (existsFlag === false) {
            console.log(`Destination ${numToTry} not found on WhatsApp, trying next format...`);
            continue;
          }

          console.log(`Transfer request failed for ${numToTry}, trying next format...`);
        }

        if (!transferSuccess) {
          throw new Error(`All transfer attempts failed for ${transferNum}. Last response: ${lastTransferResponse}`);
        }

        await supabase
          .from("conversations")
          .update({ status: "transferred" })
          .eq("id", conversation_id);

        console.log(`Lead transferido para: ${transferNum}`);
      } catch (transferErr) {
        console.error("Error sending transfer summary:", transferErr);
      }
    }

    const mediaRegex = /SEND_MEDIA:([a-f0-9-]+)/gi;
    const mediaMatches = [...cleanResponse.matchAll(mediaRegex)];
    cleanResponse = cleanResponse.replace(mediaRegex, "").replace(/\s{2,}/g, " ").trim();

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

    if (cleanResponse) {
      await supabase.from("messages").insert({
        conversation_id,
        role: "assistant",
        content: cleanResponse,
      });

      await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evoKey || "" },
        body: JSON.stringify({ number: contact_number, text: cleanResponse }),
      });
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