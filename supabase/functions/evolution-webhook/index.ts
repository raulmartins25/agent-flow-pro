import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const event = body.event;
    const data = body.data;
    const instance = body.instance;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (event === "messages.upsert") {
      const msg = data;
      const remoteJid = msg.key?.remoteJid?.replace("@s.whatsapp.net", "") || "";
      const fromMe = msg.key?.fromMe || false;
      const content = msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption || "";
      const instanceName = instance?.instanceName || "";

      const { data: agent } = await supabase
        .from("agents")
        .select("id, user_id, status, type, prompt_compiled, llm_provider, llm_model, llm_api_key")
        .eq("evolution_instance", instanceName)
        .eq("status", "active")
        .single();

      if (!agent) {
        return new Response(JSON.stringify({ ok: true, message: "No active agent" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let { data: conversation } = await supabase
        .from("conversations")
        .select("*")
        .eq("agent_id", agent.id)
        .eq("contact_number", remoteJid)
        .in("status", ["active", "paused"])
        .single();

      if (!conversation) {
        const { data: newConv } = await supabase
          .from("conversations")
          .insert({
            agent_id: agent.id,
            contact_number: remoteJid,
            contact_name: msg.pushName || remoteJid,
            status: "active",
          })
          .select()
          .single();
        conversation = newConv;
      }

      if (!conversation) {
        return new Response(JSON.stringify({ error: "Failed to create conversation" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Determine media
      let mediaUrl = null;
      let mediaType = null;
      if (msg.message?.imageMessage) { mediaType = "image"; }
      else if (msg.message?.audioMessage) { mediaType = "audio"; }
      else if (msg.message?.documentMessage) { mediaType = "document"; }
      else if (msg.message?.videoMessage) { mediaType = "video"; }

      // --- PROSPECTING: Lead replied to blast (is_waiting_reply) ---
      if (!fromMe && conversation.is_waiting_reply) {
        // Flip waiting flag
        await supabase
          .from("conversations")
          .update({ is_waiting_reply: false })
          .eq("id", conversation.id);

        // Save lead's message
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          role: "user",
          content,
          media_url: mediaUrl,
          media_type: mediaType,
        });

        // Update last_message_at
        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversation.id);

        // Get history for AI
        const { data: history } = await supabase
          .from("messages")
          .select("role, content")
          .eq("conversation_id", conversation.id)
          .order("created_at", { ascending: true })
          .limit(50);

        // Trigger AI
        const processUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/process-message`;
        await fetch(processUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            conversation_id: conversation.id,
            agent,
            history: history || [],
            contact_number: remoteJid,
            instance_name: instanceName,
          }),
        });

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Save incoming message
      const role = fromMe ? "assistant" : "user";
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role,
        content,
        media_url: mediaUrl,
        media_type: mediaType,
      });

      // Update last_message_at
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversation.id);

      // Skip AI if agent_paused or fromMe
      if (conversation.agent_paused || fromMe) {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get conversation history
      const { data: history } = await supabase
        .from("messages")
        .select("role, content")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true })
        .limit(50);

      // Call process-message
      const processUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/process-message`;
      await fetch(processUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          conversation_id: conversation.id,
          agent,
          history: history || [],
          contact_number: remoteJid,
          instance_name: instanceName,
        }),
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
