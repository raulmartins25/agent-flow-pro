import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get active conversations that haven't been replied to
    const { data: conversations } = await supabase
      .from("conversations")
      .select("*, agents(*, agent_config(*))")
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

      const followupMax = agent.followup_max || 3;
      const followupInterval = agent.followup_interval_minutes || 120;
      const followupStart = agent.followup_start_message || 3;

      // Skip if already hit max followups
      if (conv.followup_count >= followupMax) continue;

      // Get last message
      const { data: lastMessages } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!lastMessages || lastMessages.length === 0) continue;
      const lastMsg = lastMessages[0];

      // Only followup if last message was from us (assistant) and enough time has passed
      if (lastMsg.role !== "assistant") continue;

      const lastTime = new Date(lastMsg.created_at).getTime();
      const now = Date.now();
      const elapsed = (now - lastTime) / (1000 * 60); // minutes

      if (elapsed < followupInterval) continue;

      // Get total message count
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conv.id);

      if ((count || 0) < followupStart) continue;

      // Send followup
      const followupMessages = [
        "Olá! Tudo bem? Notei que não recebi sua resposta. Posso te ajudar com algo? 😊",
        "Oi! Só passando para verificar se tem alguma dúvida. Estou à disposição! 👋",
        "Olá novamente! Caso tenha interesse, estou por aqui para ajudar. 🙂",
      ];

      const followupText = followupMessages[Math.min(conv.followup_count, followupMessages.length - 1)];

      // Save followup message
      await supabase.from("messages").insert({
        conversation_id: conv.id,
        role: "assistant",
        content: followupText,
      });

      // Send via Evolution API
      if (agent.evolution_api_url && agent.evolution_instance) {
        await fetch(`${agent.evolution_api_url}/message/sendText/${agent.evolution_instance}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: agent.evolution_api_key || "",
          },
          body: JSON.stringify({
            number: conv.contact_number,
            text: followupText,
          }),
        });
      }

      // Increment followup count
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
