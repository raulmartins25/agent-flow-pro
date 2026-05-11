import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Strip JID suffix and non-digits → pure phone digits */
function normalizeContactNumber(jid: string): string {
  return jid.replace(/@.*$/, "").replace(/\D/g, "");
}

/** Normalize BR phone to canonical 13-digit format: 55 + 2-digit DDD + 9 + 8 digits */
function canonicalPhone(raw: string): string {
  let digits = normalizeContactNumber(raw);
  if (digits.startsWith("55") && digits.length === 12) {
    digits = digits.slice(0, 4) + "9" + digits.slice(4);
  }
  return digits;
}

/** Insert message with idempotency — returns true if duplicate */
async function insertMessageIdempotent(
  supabase: any,
  params: { conversation_id: string; role: string; content: string; evolution_message_id?: string; media_url?: string | null; media_type?: string | null }
): Promise<boolean> {
  const { error } = await supabase.from("messages").insert(params);
  if (error) {
    if (error.code === "23505") {
      console.log("Duplicate message detected (23505), skipping:", params.evolution_message_id);
      return true;
    }
    console.error("Error inserting message:", error);
  }
  return false;
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

    if (event !== "messages.upsert") {
      return new Response(JSON.stringify({ ok: true, event }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const msg = data;
    const rawJid = msg.key?.remoteJid || "";
    const fromMe = msg.key?.fromMe || false;
    const evolutionMessageId = msg.key?.id || null;

    // === 1. GROUP FILTER ===
    if (rawJid.endsWith("@g.us")) {
      console.log("Group message ignored:", rawJid);
      return new Response(JSON.stringify({ ok: true, message: "Group message ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === 2. FROM_ME FILTER (prevent loop) ===
    if (fromMe) {
      console.log("Own message ignored (fromMe=true), msgId:", evolutionMessageId);
      return new Response(JSON.stringify({ ok: true, message: "Own message ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === 3. NORMALIZE (use canonicalPhone so BR numbers match blast-created conversations) ===
    const contactNumber = canonicalPhone(rawJid);
    const content = msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption || "";

    console.log("Contact:", contactNumber, "(raw:", rawJid, ") Content:", content?.substring(0, 100));

    if (!instanceName) {
      console.log("instanceName empty, ignoring");
      return new Response(JSON.stringify({ ok: true, message: "No instance name" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === 4. DEVICE/AGENT LOOKUP ===
    const { data: device } = await supabase
      .from("devices")
      .select("*")
      .eq("instance_name", instanceName)
      .eq("status", "connected")
      .single();

    if (!device) {
      console.log("No connected device for instance:", instanceName);
      return new Response(JSON.stringify({ ok: true, message: "No device found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: agent } = await supabase
      .from("agents")
      .select("id, user_id, status, type, prompt_compiled, llm_provider, llm_model, llm_api_key, device_id")
      .eq("device_id", device.id)
      .eq("status", "active")
      .single();

    if (!agent) {
      console.log("No active agent for device:", device.id);
      return new Response(JSON.stringify({ ok: true, message: "No active agent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === 5. BLACKLIST (normalized comparison) ===
    const canonicalRemote = canonicalPhone(rawJid);
    const { data: blRows } = await supabase
      .from("blacklist")
      .select("id, phone")
      .eq("user_id", agent.user_id)
      .eq("device_id", device.id);

    const blacklisted = (blRows || []).some(
      (b: any) => canonicalPhone(b.phone) === canonicalRemote
    );

    if (blacklisted) {
      console.log(`Number ${canonicalRemote} is blacklisted — ignoring`);
      await supabase
        .from("conversations")
        .update({ status: "closed", agent_paused: true, paused_by: "ai", is_waiting_reply: false })
        .eq("agent_id", agent.id)
        .eq("device_id", device.id)
        .eq("contact_number", contactNumber)
        .in("status", ["active", "paused"]);
      return new Response(JSON.stringify({ ok: true, message: "Blacklisted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === 6. CONVERSATION LOOKUP (normalized) ===
    const contactName = msg.pushName || rawJid.split("@")[0] || "Contato";

    // Determine media
    let mediaUrl = null;
    let mediaType = null;
    if (msg.message?.imageMessage) { mediaType = "image"; }
    else if (msg.message?.audioMessage) { mediaType = "audio"; }
    else if (msg.message?.documentMessage) { mediaType = "document"; }
    else if (msg.message?.videoMessage) { mediaType = "video"; }

    // === AUDIO TRANSCRIPTION ===
    // If message is audio, fetch base64 from Evolution and transcribe via Lovable AI (Gemini)
    let transcribedContent = content;
    if (mediaType === "audio" && !content) {
      try {
        console.log("Audio message detected, fetching base64 from Evolution...");
        const b64Resp = await fetch(
          `${device.evolution_api_url}/chat/getBase64FromMediaMessage/${device.instance_name}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: device.evolution_api_key,
            },
            body: JSON.stringify({
              message: { key: msg.key },
              convertToMp4: false,
            }),
          }
        );
        const b64Data = await b64Resp.json();
        const audioBase64 = b64Data?.base64 || b64Data?.data;
        if (!audioBase64) {
          console.error("Evolution returned no base64:", JSON.stringify(b64Data).slice(0, 300));
        } else {
          const mimetype = msg.message?.audioMessage?.mimetype || "audio/ogg";
          const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: "Transcreva o áudio a seguir em português brasileiro. Responda APENAS com a transcrição literal, sem comentários, sem aspas, sem prefixos." },
                    { type: "input_audio", input_audio: { data: audioBase64, format: mimetype.includes("mp3") ? "mp3" : "ogg" } },
                  ],
                },
              ],
            }),
          });
          if (!aiResp.ok) {
            const errTxt = await aiResp.text();
            console.error("Transcription failed:", aiResp.status, errTxt.slice(0, 300));
          } else {
            const aiData = await aiResp.json();
            const transcript = aiData?.choices?.[0]?.message?.content?.trim() || "";
            if (transcript) {
              transcribedContent = `[Áudio transcrito] ${transcript}`;
              console.log("Audio transcribed:", transcript.slice(0, 200));
            }
          }
        }
      } catch (e) {
        console.error("Audio transcription error:", (e as Error).message);
      }
      if (!transcribedContent) {
        transcribedContent = "[Áudio recebido — não foi possível transcrever]";
      }
    }

    // Look for existing conversations (any non-closed status)
    const { data: existingConvs } = await supabase
      .from("conversations")
      .select("*")
      .eq("agent_id", agent.id)
      .eq("device_id", device.id)
      .eq("contact_number", contactNumber)
      .in("status", ["active", "paused", "transferred"])
      .order("created_at", { ascending: false })
      .limit(1);

    // Also check waiting_reply (blast prospecting)
    const { data: waitingConvs } = await supabase
      .from("conversations")
      .select("*")
      .eq("agent_id", agent.id)
      .eq("device_id", device.id)
      .eq("contact_number", contactNumber)
      .eq("is_waiting_reply", true)
      .order("created_at", { ascending: false })
      .limit(1);

    const waitingConv = waitingConvs?.[0] || null;
    const activeConv = existingConvs?.[0] || null;
    let conversation = waitingConv || activeConv;

    // Update contact_name if needed
    if (conversation && msg.pushName && (!conversation.contact_name || conversation.contact_name === conversation.contact_number)) {
      await supabase.from("conversations").update({ contact_name: contactName }).eq("id", conversation.id);
      conversation.contact_name = contactName;
    }

    // === 7. EARLY RETURN for transferred/closed/paused ===
    if (conversation && ["transferred", "closed", "paused"].includes(conversation.status)) {
      console.log(`Conversation ${conversation.id} status=${conversation.status} — saving message, AI stopped. msgId:`, evolutionMessageId);

      const isDuplicate = await insertMessageIdempotent(supabase, {
        conversation_id: conversation.id,
        role: "user",
        content: transcribedContent,
        evolution_message_id: evolutionMessageId,
        media_url: mediaUrl,
        media_type: mediaType,
      });

      if (isDuplicate) {
        return new Response(JSON.stringify({ ok: true, message: "Duplicate" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversation.id);

      return new Response(JSON.stringify({ ok: true, skipped: true, reason: conversation.status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === 8. PROSPECTING: Lead replied to blast (is_waiting_reply) ===
    if (conversation && conversation.is_waiting_reply) {
      console.log("Lead replied to blast, activating agent for conversation:", conversation.id);
      await supabase
        .from("conversations")
        .update({ is_waiting_reply: false })
        .eq("id", conversation.id);

      const isDuplicate = await insertMessageIdempotent(supabase, {
        conversation_id: conversation.id,
        role: "user",
        content: transcribedContent,
        evolution_message_id: evolutionMessageId,
        media_url: mediaUrl,
        media_type: mediaType,
      });

      if (isDuplicate) {
        return new Response(JSON.stringify({ ok: true, message: "Duplicate" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversation.id);

      const { data: history } = await supabase
        .from("messages")
        .select("role, content")
        .eq("conversation_id", conversation.id)
        .not("content", "is", null)
        .neq("content", "")
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
          contact_number: contactNumber,
          contact_name: conversation.contact_name || contactName,
          instance_name: instanceName,
          device_id: device.id,
        }),
      });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === 9. UPSERT conversation (atomic, ignoreDuplicates) ===
    if (!conversation) {
      const { data: upserted } = await supabase
        .from("conversations")
        .upsert(
          {
            agent_id: agent.id,
            device_id: device.id,
            instance_name: instanceName,
            contact_number: contactNumber,
            contact_name: contactName,
            status: "active",
          },
          { onConflict: "agent_id,device_id,contact_number", ignoreDuplicates: true }
        )
        .select()
        .single();

      if (upserted) {
        conversation = upserted;
        console.log("Created/found conversation via upsert:", conversation.id);
      } else {
        // upsert returned nothing (ignoreDuplicates hit) — fetch existing
        const { data: fetched } = await supabase
          .from("conversations")
          .select("*")
          .eq("agent_id", agent.id)
          .eq("device_id", device.id)
          .eq("contact_number", contactNumber)
          .in("status", ["active", "paused", "transferred"])
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        conversation = fetched;
        console.log("Fetched existing conversation after upsert:", conversation?.id);
      }
    }

    if (!conversation) {
      return new Response(JSON.stringify({ error: "Failed to create conversation" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === 10. INSERT MESSAGE (idempotent) ===
    const isDuplicate = await insertMessageIdempotent(supabase, {
      conversation_id: conversation.id,
      role: "user",
      content: transcribedContent,
      evolution_message_id: evolutionMessageId,
      media_url: mediaUrl,
      media_type: mediaType,
    });

    if (isDuplicate) {
      return new Response(JSON.stringify({ ok: true, message: "Duplicate" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.id);

    // Check agent_paused
    if (conversation.agent_paused) {
      console.log("Agent paused for conversation:", conversation.id);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === 11. CALL PROCESS-MESSAGE ===
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversation.id)
      .not("content", "is", null)
      .neq("content", "")
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
        contact_number: contactNumber,
        contact_name: conversation.contact_name || contactName,
        instance_name: instanceName,
        device_id: device.id,
      }),
    });

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
