import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Normalize BR phone to canonical 13-digit format: 55 + 2-digit DDD + 9 + 8 digits */
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
    const body = await req.json();
    const event = body.event;
    const data = body.data;

    const rawInstance = body.instance;
    const instanceName = typeof rawInstance === "string"
      ? rawInstance
      : rawInstance?.instanceName || "";

    console.log("=== WEBHOOK RECEBIDO ===");
    console.log("Event:", event, "Instance:", instanceName || "unknown");
    console.log("Body:", JSON.stringify(body).substring(0, 500));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (event === "messages.upsert") {
      const msg = data;
      const rawJid = (msg.key?.remoteJid || "");
      const remoteJid = canonicalPhone(rawJid);
      const fromMe = msg.key?.fromMe || false;

      const content = msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption || "";

      console.log("Remote:", remoteJid, "(raw:", rawJid, ") FromMe:", fromMe, "Content:", content?.substring(0, 100));

      if (fromMe) {
        console.log("Ignorando mensagem própria (fromMe=true)");
      }

      if (!instanceName) {
        console.log("instanceName vazio, ignorando");
        return new Response(JSON.stringify({ ok: true, message: "No instance name" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find device
      const { data: device, error: deviceErr } = await supabase
        .from("devices")
        .select("*")
        .eq("instance_name", instanceName)
        .eq("status", "connected")
        .single();

      console.log("Device lookup:", device ? `Found ${device.id} (${device.name})` : `Not found (${deviceErr?.message})`);

      if (!device) {
        return new Response(JSON.stringify({ ok: true, message: "No device found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find active agent
      const { data: agent, error: agentErr } = await supabase
        .from("agents")
        .select("id, user_id, status, type, prompt_compiled, llm_provider, llm_model, llm_api_key, device_id")
        .eq("device_id", device.id)
        .eq("status", "active")
        .single();

      console.log("Agent lookup:", agent ? `Found ${agent.id}` : `Not found (${agentErr?.message})`);

      if (!agent) {
        return new Response(JSON.stringify({ ok: true, message: "No active agent for device" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- RANKED conversation lookup ---
      // Get all conversations for this agent+device+canonical phone
      const { data: allConvs } = await supabase
        .from("conversations")
        .select("*")
        .eq("agent_id", agent.id)
        .eq("device_id", device.id)
        .eq("contact_number", remoteJid)
        .order("created_at", { ascending: false });

      let conversation = null;

      if (allConvs && allConvs.length > 0) {
        // Prioritize: is_waiting_reply first, then active/paused, then any
        const waitingConv = allConvs.find((c: any) => c.is_waiting_reply);
        const activeConv = allConvs.find((c: any) => c.status === "active" || c.status === "paused");
        conversation = waitingConv || activeConv || allConvs[0];
        
        // Reactivate if transferred/closed
        if (conversation.status === "transferred" || conversation.status === "closed") {
          await supabase.from("conversations").update({ status: "active" }).eq("id", conversation.id);
          conversation.status = "active";
        }
        console.log("Using existing conversation:", conversation.id, "status:", conversation.status, "is_waiting_reply:", conversation.is_waiting_reply);
      }

      if (!conversation) {
        const { data: newConv } = await supabase
          .from("conversations")
          .insert({
            agent_id: agent.id,
            device_id: device.id,
            instance_name: instanceName,
            contact_number: remoteJid,
            contact_name: msg.pushName || remoteJid,
            status: "active",
          })
          .select()
          .single();
        conversation = newConv;
        console.log("Created new conversation:", newConv?.id);
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

      // --- PROSPECTING: Lead replied to blast ---
      if (!fromMe && conversation.is_waiting_reply) {
        console.log("Lead replied to blast, activating agent for conversation:", conversation.id);
        await supabase
          .from("conversations")
          .update({ is_waiting_reply: false })
          .eq("id", conversation.id);

        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          role: "user",
          content,
          media_url: mediaUrl,
          media_type: mediaType,
        });

        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversation.id);

        const { data: history } = await supabase
          .from("messages")
          .select("role, content")
          .eq("conversation_id", conversation.id)
          .order("created_at", { ascending: true })
          .limit(50);

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
            device_id: device.id,
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

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversation.id);

      if (conversation.agent_paused || fromMe) {
        console.log("Skipping process-message: paused=", conversation.agent_paused, "fromMe=", fromMe);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: history } = await supabase
        .from("messages")
        .select("role, content")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true })
        .limit(50);

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
          device_id: device.id,
        }),
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
