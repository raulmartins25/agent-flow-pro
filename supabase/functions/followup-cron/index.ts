import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Normalize BR phone to canonical 13-digit format */
function canonicalPhone(raw: string): string {
  let digits = raw.replace(/@.*$/, "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length === 12) {
    digits = digits.slice(0, 4) + "9" + digits.slice(4);
  }
  return digits;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: conversations } = await supabase
      .from("conversations")
      .select("*, agents(*, devices(*))")
      .eq("status", "active")
      .eq("agent_paused", false);

    if (!conversations || conversations.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sentCount = 0;

    for (const conv of conversations) {
      const agent = conv.agents as any;
      if (!agent || agent.status !== "active") continue;

      const device = agent.devices;
      if (!device || device.status !== "connected") continue;

      // --- BLACKLIST CHECK ---
      const convCanonical = canonicalPhone(conv.contact_number);
      const { data: blRows } = await supabase
        .from("blacklist")
        .select("id, phone")
        .eq("user_id", agent.user_id)
        .eq("device_id", device.id);

      const isBlacklisted = (blRows || []).some(
        (b: any) => canonicalPhone(b.phone) === convCanonical
      );

      if (isBlacklisted) {
        console.log(`Conversa ${conv.id} — número ${convCanonical} está na blacklist, encerrando`);
        await supabase
          .from("conversations")
          .update({ status: "closed", agent_paused: true, paused_by: "ai", is_waiting_reply: false })
          .eq("id", conv.id);
        continue;
      }

      // Prospecting agents: only followup if lead already replied (is_waiting_reply === false)
      if (agent.type === "prospecting" && conv.is_waiting_reply === true) {
        console.log(`Conversa ${conv.id} ignorada — lead nunca respondeu ao disparo`);
        continue;
      }

      const followupMax = agent.followup_max ?? 3;
      const followupInterval = agent.followup_interval_minutes ?? 120;
      const followupStart = agent.followup_start_message ?? 3;

      if (conv.followup_count >= followupMax) continue;

      const { data: lastMessages } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!lastMessages || lastMessages.length === 0) continue;
      const lastMsg = lastMessages[0];

      if (lastMsg.role !== "assistant") continue;

      // Safety check: if last user message shows disinterest, close conversation
      const { data: lastUserMsgs } = await supabase
        .from("messages")
        .select("content")
        .eq("conversation_id", conv.id)
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .limit(1);

      const userText = (lastUserMsgs?.[0]?.content || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const disinterestPhrases = [
        "nao obrigado", "nao obrigada", "nao tenho interesse", "sem interesse",
        "nao quero", "nao me interessa", "obrigado mas nao", "obrigada mas nao",
        "nao preciso", "nao quero receber", "nao precisa", "sem interesse aqui",
        "nao desejo", "nao necessito", "dispenso", "nao e do meu interesse",
        "para", "stop", "spam",
      ];
      if (disinterestPhrases.some(w => userText.includes(w))) {
        console.log(`Conversa ${conv.id} — desinteresse detectado: "${lastUserMsgs?.[0]?.content}"`);
        await supabase.from("conversations")
          .update({ status: "closed", agent_paused: true, is_waiting_reply: false })
          .eq("id", conv.id);
        continue;
      }

      const lastTime = new Date(lastMsg.created_at).getTime();
      const now = Date.now();
      const elapsed = (now - lastTime) / (1000 * 60);

      if (elapsed < followupInterval) continue;

      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conv.id);

      if ((count || 0) < followupStart) continue;

      const followupMessages = [
        "Olá! Tudo bem? Notei que não recebi sua resposta. Posso te ajudar com algo? 😊",
        "Oi! Só passando para verificar se tem alguma dúvida. Estou à disposição! 👋",
        "Olá novamente! Caso tenha interesse, estou por aqui para ajudar. 🙂",
      ];

      const followupText = followupMessages[Math.min(conv.followup_count, followupMessages.length - 1)];

      await supabase.from("messages").insert({
        conversation_id: conv.id,
        role: "assistant",
        content: followupText,
      });

      await fetch(`${device.evolution_api_url}/message/sendText/${device.instance_name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: device.evolution_api_key || "",
        },
        body: JSON.stringify({
          number: conv.contact_number,
          text: followupText,
        }),
      });

      await supabase
        .from("conversations")
        .update({
          followup_count: conv.followup_count + 1,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conv.id);

      sentCount++;
    }

    return new Response(JSON.stringify({ ok: true, processed: sentCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Followup cron error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
