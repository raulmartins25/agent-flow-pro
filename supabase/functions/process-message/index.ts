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

    let evoUrl = device.evolution_api_url.replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(evoUrl)) evoUrl = `https://${evoUrl}`;
    const evoKey = device.evolution_api_key;
    const evoInstance = device.instance_name;

    // --- BLACKLIST CHECK ---
    const contactCanonical = contact_number.replace(/@.*$/, "").replace(/\D/g, "");
    const contactCanonical13 = contactCanonical.startsWith("55") && contactCanonical.length === 12
      ? contactCanonical.slice(0, 4) + "9" + contactCanonical.slice(4)
      : contactCanonical;

    const { data: blRows } = await supabase
      .from("blacklist")
      .select("id, phone")
      .eq("user_id", agentFull?.user_id || agent.user_id)
      .eq("device_id", device.id);

    const isBlacklisted = (blRows || []).some((b: any) => {
      let bp = (b.phone || "").replace(/\D/g, "");
      if (bp.startsWith("55") && bp.length === 12) bp = bp.slice(0, 4) + "9" + bp.slice(4);
      return bp === contactCanonical13;
    });

    if (isBlacklisted) {
      console.log(`Número ${contactCanonical13} está na blacklist — bloqueando process-message`);
      await supabase
        .from("conversations")
        .update({ status: "closed", agent_paused: true, is_waiting_reply: false })
        .eq("id", conversation_id);
      return new Response(JSON.stringify({ ok: true, blocked: true, reason: "blacklisted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Early return for already-transferred conversations ---
    const { data: convCheck } = await supabase
      .from("conversations")
      .select("status")
      .eq("id", conversation_id)
      .single();

    if (["transferred", "closed", "paused"].includes(convCheck?.status)) {
      console.log(`Conversation ${conversation_id} status=${convCheck.status} — AI completely stopped`);
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: convCheck.status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lastUserMsg = [...history].reverse().find((m: any) => m.role === "user");
    const msgLower = (lastUserMsg?.content || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    // --- DISINTEREST DETECTION (deterministic, before LLM) ---
    const disinterestPhrases = [
      "nao obrigado", "nao obrigada", "nao tenho interesse", "sem interesse",
      "nao quero", "nao me interessa", "obrigado mas nao", "obrigada mas nao",
      "nao preciso", "nao quero receber", "nao precisa", "sem interesse aqui",
      "nao desejo", "nao necessito", "dispenso", "nao e do meu interesse",
    ];
    const isDisinterest = disinterestPhrases.some(phrase => msgLower.includes(phrase));

    if (isDisinterest) {
      console.log(`Desinteresse detectado na conversa ${conversation_id}: "${lastUserMsg?.content}"`);
      const goodbyeMsg = "Entendido! Não enviaremos mais mensagens. Se precisar de algo no futuro, é só chamar. 👋";

      await supabase.from("conversations")
        .update({ status: "closed", agent_paused: true, is_waiting_reply: false })
        .eq("id", conversation_id);

      await supabase.from("messages").insert({ conversation_id, role: "assistant", content: goodbyeMsg });

      await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evoKey || "" },
        body: JSON.stringify({ number: contact_number, text: goodbyeMsg }),
      });

      return new Response(JSON.stringify({ ok: true, action: "closed_disinterest" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- APPOINTMENT REMINDER REPLY DETECTION ---
    let appointmentContext = "";
    {
      const { data: pendingAppts } = await supabase
        .from("appointments")
        .select("*")
        .eq("conversation_id", conversation_id)
        .eq("status", "scheduled")
        .gt("start_time", new Date().toISOString())
        .or("reminder_24h_status.eq.sent,reminder_2h_status.eq.sent")
        .order("start_time", { ascending: true })
        .limit(1);

      const appt = pendingAppts?.[0];
      if (appt && msgLower) {
        const confirmWords = ["sim", "confirmo", "confirmado", "confirmada", "ok", "okay", "estarei", "vou sim", "pode confirmar", "ta", "tá", "combinado", "perfeito", "claro", "positivo", "afirmativo", "blz", "beleza"];
        const cancelWords = ["nao posso", "nao vou", "nao consigo", "remarcar", "cancelar", "cancela", "desmarcar", "preciso remarcar", "outro dia", "outro horario"];

        const isConfirm = confirmWords.some(w => msgLower === w || msgLower.startsWith(w + " ") || msgLower.endsWith(" " + w) || msgLower.includes(" " + w + " "));
        const isCancel = cancelWords.some(w => msgLower.includes(w));

        if (isCancel) {
          // Cancela na Ecuro (se houver external_id) e localmente
          try {
            await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ecuro-cancel`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                appointment_id: appt.id,
                agent_id: appt.agent_id,
                conversation_id,
                reason: 'Paciente solicitou cancelamento via WhatsApp',
              }),
            });
          } catch (e) {
            console.error('ecuro-cancel call failed', e);
            await supabase.from("appointments").update({ status: "cancelled" }).eq("id", appt.id);
          }
          appointmentContext = `\n\nCONTEXTO CRÍTICO: O paciente pediu para CANCELAR/REMARCAR o agendamento. O cancelamento já foi processado no sistema. Reconheça com empatia, confirme que o agendamento foi cancelado e informe que a equipe entrará em contato se quiser remarcar. Emita TRANSFER_LEAD.`;
        } else if (isConfirm) {
          const via = appt.reminder_2h_status === "sent" ? "2h" : "24h";
          await supabase.from("appointments").update({
            status: "confirmed",
            confirmed_at: new Date().toISOString(),
            confirmed_via: via,
            reminder_24h_status: appt.reminder_24h_status === "pending" ? "skipped" : appt.reminder_24h_status,
            reminder_2h_status: appt.reminder_2h_status === "pending" ? "skipped" : appt.reminder_2h_status,
          }).eq("id", appt.id);
          // Sincroniza confirmação com Ecuro (fire-and-forget)
          try {
            fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ecuro-confirm`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                appointment_id: appt.id,
                agent_id: appt.agent_id,
                conversation_id,
              }),
            }).catch((e) => console.error('ecuro-confirm call failed', e));
          } catch (e) {
            console.error('ecuro-confirm trigger error', e);
          }
          appointmentContext = `\n\nCONTEXTO CRÍTICO: O paciente CONFIRMOU presença no agendamento. Agradeça brevemente, deseje uma boa consulta e encerre. NÃO faça mais perguntas.`;
        }
      }
    }

    // --- BAN TRIGGERS (aggressive opt-out) ---
    if (lastUserMsg?.content && agentFull?.restrictions) {
      const banTriggers = ["para", "stop", "me tira", "denuncia", "spam", "me bloqueia"];
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

    // Inject current date/time (America/Sao_Paulo) so the LLM never invents dates
    const nowBR = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date());
    systemPrompt += `\n\nDATA E HORA ATUAL (America/Sao_Paulo): ${nowBR}.\nNUNCA invente datas. Para qualquer agendamento, use SOMENTE as datas e labels retornados pela ferramenta get_availability — não calcule você mesmo.`;

    // Clean contact name: reject JIDs and pure-numeric strings
    const rawContactName = contact_name || null;
    const cleanContactName = rawContactName && 
      !rawContactName.includes('@') && 
      !/^\d{8,}$/.test(rawContactName.trim())
        ? rawContactName.trim()
        : null;

    const nameInstruction = cleanContactName
      ? `\n\nINFORMAÇÃO DO CONTATO:\nO nome do contato é "${cleanContactName}" (obtido automaticamente do WhatsApp). Use-o para personalizar, mas NÃO peça o nome — você já o tem.`
      : `\n\nINFORMAÇÃO DO CONTATO:\nO nome do contato não está disponível. NÃO faça perguntas para descobrir o nome — não é necessário para a qualificação.`;

    systemPrompt += nameInstruction;
    if (appointmentContext) systemPrompt += appointmentContext;

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
    let lastScheduleResult: any = null;
    let scheduleSucceeded = false;

    // Check if Ecuro integration is enabled for this agent
    const { data: ecuroIntegration } = await supabase
      .from("agent_integrations")
      .select("enabled, config")
      .eq("agent_id", agent.id)
      .eq("provider", "ecuro")
      .maybeSingle();
    const ecuroEnabled = !!ecuroIntegration?.enabled;

    // Inject clinic location info (address + maps URL) when configured
    {
      const c: any = ecuroIntegration?.config || {};
      const clinicName = c.clinic_name || null;
      const address = c.address || null;
      const mapsUrl = c.maps_url || null;
      if (clinicName || address || mapsUrl) {
        systemPrompt += `\n\nLOCAL DA CLÍNICA (use SEMPRE estes dados exatos quando o paciente pedir endereço ou localização):`;
        if (clinicName) systemPrompt += `\n- Nome: ${clinicName}`;
        if (address) systemPrompt += `\n- Endereço: ${address}`;
        if (mapsUrl) systemPrompt += `\n- Link do mapa: ${mapsUrl}`;
        systemPrompt += `\nNUNCA invente, encurte ou modifique este link. NÃO use goo.gl, bit.ly ou qualquer encurtador. Envie o link exatamente como acima.`;
      }
    }

    const ecuroTools = ecuroEnabled ? [
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
    ] : undefined;

    async function runEcuroTool(name: string, args: any) {
      const supaUrl = Deno.env.get("SUPABASE_URL")!;
      try {
        if (name === "get_availability") {
          const r = await fetch(`${supaUrl}/functions/v1/ecuro-availability`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agent_id: agent.id, ...args }),
          });
          return await r.json();
        }
        if (name === "schedule_appointment") {
          const r = await fetch(`${supaUrl}/functions/v1/ecuro-schedule`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agent_id: agent.id,
              conversation_id,
              patient_phone: contact_number,
              ...args,
            }),
          });
          const result = await r.json();
          lastScheduleResult = { ok: r.ok, result, args };
          if (r.ok && result?.success) scheduleSucceeded = true;
          return result;
        }
        return { error: "unknown tool" };
      } catch (e) {
        return { error: String(e) };
      }
    }

    if (agent.llm_provider === "claude") {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      const conv = [...messages];
      for (let iter = 0; iter < 4; iter++) {
        const body: any = { model: "google/gemini-2.5-flash", messages: conv, stream: false };
        if (ecuroTools) { body.tools = ecuroTools; body.tool_choice = "auto"; }
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) { const t = await res.text(); throw new Error(`AI gateway error ${res.status}: ${t}`); }
        const data = await res.json();
        const choice = data.choices?.[0]?.message;
        const toolCalls = choice?.tool_calls;
        if (toolCalls && toolCalls.length > 0) {
          conv.push({ role: "assistant", content: choice.content || "", tool_calls: toolCalls } as any);
          for (const tc of toolCalls) {
            let parsedArgs: any = {};
            try { parsedArgs = JSON.parse(tc.function?.arguments || "{}"); } catch {}
            const toolResult = await runEcuroTool(tc.function?.name, parsedArgs);
            console.log(`Ecuro tool ${tc.function?.name} →`, JSON.stringify(toolResult).substring(0, 300));
            conv.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify(toolResult),
            } as any);
          }
          continue;
        }
        aiResponse = choice?.content || "";
        break;
      }
    } else if (agent.llm_provider === "openai") {
      const openaiKey = agent.llm_api_key || Deno.env.get("OPENAI_API_KEY");
      const conv = [...messages];
      for (let iter = 0; iter < 4; iter++) {
        const body: any = { model: agent.llm_model || "gpt-4.1-mini", messages: conv };
        if (ecuroTools) { body.tools = ecuroTools; body.tool_choice = "auto"; }
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error(`OpenAI error ${res.status}: ${errText}`);
          throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 300)}`);
        }
        const data = await res.json();
        const choice = data.choices?.[0]?.message;
        const toolCalls = choice?.tool_calls;
        if (toolCalls && toolCalls.length > 0) {
          conv.push({ role: "assistant", content: choice.content || "", tool_calls: toolCalls } as any);
          for (const tc of toolCalls) {
            let parsedArgs: any = {};
            try { parsedArgs = JSON.parse(tc.function?.arguments || "{}"); } catch {}
            const toolResult = await runEcuroTool(tc.function?.name, parsedArgs);
            console.log(`Ecuro tool ${tc.function?.name} →`, JSON.stringify(toolResult).substring(0, 300));
            conv.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(toolResult) } as any);
          }
          continue;
        }
        aiResponse = choice?.content || "";
        break;
      }
    } else if (agent.llm_provider === "deepseek") {
      const modelMap: Record<string, string> = {
        "deepseek-v3": "deepseek-chat",
        "deepseek-v2": "deepseek-chat",
      };
      const requestedModel = agent.llm_model || "deepseek-chat";
      const actualModel = modelMap[requestedModel] || requestedModel;
      console.log(`DeepSeek: requested=${requestedModel}, using=${actualModel}`);

      const conv = [...messages];
      for (let iter = 0; iter < 4; iter++) {
        const body: any = { model: actualModel, messages: conv };
        if (ecuroTools) { body.tools = ecuroTools; body.tool_choice = "auto"; }
        const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${agent.llm_api_key}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const resText = await res.text();
        console.log(`DeepSeek API: status=${res.status}, body=${resText.substring(0, 400)}`);
        if (!res.ok) {
          throw new Error(`DeepSeek API error ${res.status}: ${resText.substring(0, 300)}`);
        }
        const data = JSON.parse(resText);
        const choice = data.choices?.[0]?.message;
        const toolCalls = choice?.tool_calls;
        if (toolCalls && toolCalls.length > 0) {
          conv.push({ role: "assistant", content: choice.content || "", tool_calls: toolCalls } as any);
          for (const tc of toolCalls) {
            let parsedArgs: any = {};
            try { parsedArgs = JSON.parse(tc.function?.arguments || "{}"); } catch {}
            const toolResult = await runEcuroTool(tc.function?.name, parsedArgs);
            console.log(`Ecuro tool ${tc.function?.name} →`, JSON.stringify(toolResult).substring(0, 300));
            conv.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(toolResult) } as any);
          }
          continue;
        }
        aiResponse = choice?.content || "";
        break;
      }
    }

    // Fallback: if scheduling succeeded but the LLM didn't produce a final user-facing message,
    // build the confirmation deterministically so the patient never gets left hanging.
    if (scheduleSucceeded && (!aiResponse || aiResponse.trim().length < 20)) {
      try {
        const startIso = lastScheduleResult?.args?.start_time;
        const cfgAny: any = ecuroIntegration?.config || {};
        const clinicName = cfgAny.clinic_name || cfgAny.clinic || "";
        let when = "";
        if (startIso) {
          const d = new Date(startIso);
          const dias = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
          const dia = dias[d.getDay()];
          const dd = String(d.getDate()).padStart(2,"0");
          const mm = String(d.getMonth()+1).padStart(2,"0");
          const yyyy = d.getFullYear();
          const hh = String(d.getHours()).padStart(2,"0");
          const mi = String(d.getMinutes()).padStart(2,"0");
          when = `${dia}, ${dd}/${mm}/${yyyy} às ${hh}h${mi !== "00" ? mi : ""}`;
        }
        aiResponse = `Prontinho! ✅ Seu agendamento está confirmado.\n\n📅 ${when}${clinicName ? `\n📍 ${clinicName}` : ""}\n\nVou avisar nossa equipe. Te esperamos lá! 💛 TRANSFER_LEAD`;
        console.log("Schedule fallback message generated (LLM returned empty)");
      } catch (e) {
        console.error("Schedule fallback failed", e);
      }
    }

    if (!aiResponse) {
      console.error(`Empty AI response. Provider=${agent.llm_provider}, Model=${agent.llm_model}`);
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let shouldTransfer = aiResponse.includes("TRANSFER_LEAD");
    const shouldEndConversation = aiResponse.includes("END_CONVERSATION");
    let cleanResponse = aiResponse.replace(/TRANSFER_LEAD/g, "").replace(/END_CONVERSATION/g, "").trim();

    // --- Auto-format: preserve paragraph breaks for WhatsApp readability ---
    function prettifyForWhatsApp(text: string): string {
      let t = text.replace(/\r\n/g, "\n");
      t = t.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n");
      t = t.replace(/\n{3,}/g, "\n\n");
      t = t.replace(/([^\n])\s+(?=(?:📅|⏰|📍|✅|💛|🎯|🗓️|🕐|📌))/gu, "$1\n\n");
      // Replace any hallucinated short URLs (goo.gl/bit.ly/tinyurl) with the configured maps URL when available
      const cfgMaps = (ecuroIntegration?.config as any)?.maps_url;
      if (cfgMaps) {
        t = t.replace(/https?:\/\/(?:goo\.gl|bit\.ly|tinyurl\.com|t\.co|cutt\.ly)\/\S+/gi, cfgMaps);
      }
      return t.trim();
    }
    cleanResponse = prettifyForWhatsApp(cleanResponse);

    // --- Programmatic transfer detection ---
    const questions = (config?.qualification_questions as any[]) || [];
    const userMessages = history.filter((m: any) => m.role === "user");
    const offset = agentFull?.type === "prospecting" ? 1 : 0;
    const answeredQuestions = userMessages.length - offset;
    const transferTrigger = agentFull?.transfer_trigger || "after_all_questions";

    // Check if conversation is already transferred — avoid duplicate transfers
    const { data: convStatus } = await supabase
      .from("conversations")
      .select("status")
      .eq("id", conversation_id)
      .single();
    const alreadyTransferred = convStatus?.status === "transferred";

    console.log(`Transfer check: tokenBased=${shouldTransfer}, programmatic: answered=${answeredQuestions}/${questions.length}, trigger=${transferTrigger}, transfer_number=${agentFull?.transfer_number}, alreadyTransferred=${alreadyTransferred}`);

    // Only trigger at the EXACT moment of completion (answeredQuestions === totalQuestions)
    // Not >= which would re-trigger on every subsequent message
    if (!shouldTransfer && !alreadyTransferred && transferTrigger === "after_all_questions" 
        && questions.length > 0 && answeredQuestions === questions.length 
        && agentFull?.transfer_number) {
      shouldTransfer = true;
      console.log("Transfer FORCED programmatically: exactly all questions answered this turn");
    }

    if (alreadyTransferred) {
      shouldTransfer = false;
      console.log("Skipping transfer: conversation already transferred");
    }

    if (shouldTransfer && agentFull?.transfer_number && device) {
      // Bug 2 fix: Replace AI response with fixed closing message on transfer
      cleanResponse = "Perfeito! Vou passar suas informações para nossa equipe, que entrará em contato em breve. Obrigado pelo seu tempo!";
      console.log(`Enviando resumo para número de transferência: ${agentFull.transfer_number}`);
      console.log(`Transferência sairá pelo device do agente ativo: ${device.name} (${evoInstance})`);
      console.log(`NÃO para o lead: ${contact_number}`);
      // userMessages and questions already declared above

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
          .replace(/\{\{nome_contato\}\}/g, cleanContactName || 'Não informado')
          .replace(/\{\{telefone\}\}/g, contact_number)
          .replace(/\{\{data\}\}/g, new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }))
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
        summary += `*Nome:* ${cleanContactName || 'Não informado'}\n`;
        summary += `*Telefone:* ${contact_number}\n`;
        summary += `*Data:* ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n`;
        summary += `*Agente:* ${agentFull.name}\n\n`;
        summary += `*Respostas do lead:*\n\n${perguntasRespostas}`;
      }
      // Detect indicated contact from last user message
      const lastUserMsg = userMessages[userMessages.length - 1]?.content || "";
      const phoneMatch = lastUserMsg.match(/\d{8,15}/);
      if (phoneMatch) {
        summary += `\n*Contato indicado pelo lead:* ${phoneMatch[0]}`;
        console.log(`Detected indicated contact phone: ${phoneMatch[0]}`);
      }

      const answeredQuestions = userMessages.length - (agentFull.type === "prospecting" ? 1 : 0);
      if (answeredQuestions < questions.length / 2) {
        summary += `\n*Observação:* Lead indicou que não é o decisor. Contato acima para follow-up.`;
        console.log("Added non-decision-maker observation to summary");
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

    // --- END_CONVERSATION detection ---
    if (shouldEndConversation && !shouldTransfer) {
      console.log("END_CONVERSATION detected — closing conversation");
      await supabase
        .from("conversations")
        .update({ status: "closed" })
        .eq("id", conversation_id);
    }

    // Always strip SEND_MEDIA tokens from visible text
    const mediaRegex = /SEND_MEDIA:([a-f0-9-]+)/gi;
    const mediaMatches = [...cleanResponse.matchAll(mediaRegex)];
    // Strip media tokens; collapse only spaces/tabs (preserve \n\n paragraph breaks for WhatsApp)
    cleanResponse = cleanResponse.replace(mediaRegex, "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();

    // Bug 1 fix: Only process media sending if NOT a transfer
    if (!shouldTransfer) {
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

      // --- Programmatic media detection ---
      if (questions.length > 0 && mediaMatches.length === 0) {
        const lastAnsweredIndex = answeredQuestions - 1;
        
        console.log(`Media auto-detect: answeredQuestions=${answeredQuestions}, checking indices around ${lastAnsweredIndex}`);
        
        for (let qi = 0; qi <= lastAnsweredIndex && qi < questions.length; qi++) {
          const q = questions[qi];
          if (!q?.media?.file_url) continue;
          
          const media = q.media;
          const sendCondition = media.send_condition || "always";
          
          const { data: existingMedia } = await supabase
            .from("messages")
            .select("id")
            .eq("conversation_id", conversation_id)
            .eq("media_url", media.file_url)
            .limit(1);
          
          if (existingMedia && existingMedia.length > 0) {
            console.log(`Media for Q${qi + 1} already sent, skipping`);
            continue;
          }
          
          let shouldSendMedia = false;
          
          if (sendCondition === "always") {
            shouldSendMedia = true;
          } else if (sendCondition === "positive_response" || sendCondition === "explicit_yes") {
            const answer = userMessages[qi + offset]?.content?.toLowerCase() || "";
            const negativeWords = ["não", "nao", "nunca", "jamais", "negativo", "sem interesse", "no"];
            const isNegative = negativeWords.some(w => answer.includes(w));
            shouldSendMedia = !isNegative && answer.length > 0;
          }
          
          if (shouldSendMedia) {
            console.log(`Auto-sending media for Q${qi + 1}: ${media.file_type} - ${media.file_url.substring(0, 80)}`);
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
                    ...(media.file_type === "document" ? { fileName: media.file_name || "documento" } : {}),
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
              console.log(`Media auto-sent successfully for Q${qi + 1}`);
            } catch (mediaErr) {
              console.error(`Error auto-sending media for Q${qi + 1}:`, mediaErr);
            }
          }
        }
      }
    } else {
      console.log("Skipping media processing: transfer in progress");
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