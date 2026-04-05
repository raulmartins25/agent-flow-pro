import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Normalize BR phone to canonical 13-digit format: 55 + 2-digit DDD + 9 + 8 digits */
function canonicalPhone(raw: string): string {
  let digits = raw.replace(/@.*$/, "").replace(/\D/g, "");
  // If starts with 55 and has 12 digits (missing the 9), insert it
  if (digits.startsWith("55") && digits.length === 12) {
    digits = digits.slice(0, 4) + "9" + digits.slice(4);
  }
  return digits;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { campaign_id } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: campaign } = await supabase
      .from("blast_campaigns")
      .select("*, agents(id, prompt_compiled, type, device_id, agent_config(first_prospecting_message, agent_persona_name, company_name), devices(id, evolution_api_url, evolution_api_key, instance_name, status))")
      .eq("id", campaign_id)
      .single();

    if (!campaign || !campaign.agents) {
      return new Response(JSON.stringify({ error: "Campaign or agent not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const agent = campaign.agents;
    const device = agent.devices;

    if (!device || device.status !== "connected") {
      await supabase.from("blast_campaigns").update({ status: "error" }).eq("id", campaign_id);
      return new Response(JSON.stringify({ error: "Dispositivo desconectado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("blast_campaigns")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", campaign_id);

    const batchSize = campaign.batch_size || 10;
    const intervalSeconds = campaign.interval_seconds || 45;

    const { data: contacts } = await supabase
      .from("blast_contacts")
      .select("*")
      .eq("campaign_id", campaign_id)
      .eq("status", "pending")
      .limit(batchSize);

    if (!contacts || contacts.length === 0) {
      await supabase
        .from("blast_campaigns")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", campaign_id);
      return new Response(JSON.stringify({ ok: true, message: "No pending contacts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sentCount = 0;
    let errorCount = 0;
    const agentConfig = agent.agent_config?.[0];
    const blastMessage = agentConfig?.first_prospecting_message || "Olá!";
    const agentPersonaName = agentConfig?.agent_persona_name || "";
    const companyName = agentConfig?.company_name || "";

    for (const contact of contacts) {
      try {
        const { data: currentCampaign } = await supabase
          .from("blast_campaigns")
          .select("status")
          .eq("id", campaign_id)
          .single();

        if (currentCampaign?.status === "paused" || currentCampaign?.status === "completed") {
          break;
        }

        const message = blastMessage
          .replace("{{nome_contato}}", contact.name || "")
          .replace("{{nome_agente}}", agentPersonaName)
          .replace("{{empresa}}", companyName);

        const res = await fetch(
          `${device.evolution_api_url}/message/sendText/${device.instance_name}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: device.evolution_api_key || "",
            },
            body: JSON.stringify({
              number: contact.phone,
              text: message,
            }),
          }
        );

        if (res.ok) {
          const normalizedPhone = canonicalPhone(contact.phone);

          // --- REUSE existing conversation for same agent+device+phone ---
          const { data: existingConvs } = await supabase
            .from("conversations")
            .select("*")
            .eq("agent_id", agent.id)
            .eq("device_id", device.id)
            .eq("contact_number", normalizedPhone)
            .in("status", ["active", "paused"])
            .order("created_at", { ascending: false })
            .limit(1);

          let conversation = existingConvs?.[0] || null;

          if (conversation) {
            // Reuse: update metadata
            await supabase
              .from("conversations")
              .update({
                is_waiting_reply: true,
                last_message_at: new Date().toISOString(),
                status: "active",
                ...(contact.name && contact.name !== "." ? { contact_name: contact.name } : {}),
              })
              .eq("id", conversation.id);
            console.log("Reusing conversation:", conversation.id, "for", normalizedPhone);
          } else {
            // Create new
            const { data: newConv } = await supabase
              .from("conversations")
              .insert({
                agent_id: agent.id,
                device_id: device.id,
                instance_name: device.instance_name,
                contact_number: normalizedPhone,
                contact_name: contact.name || contact.phone,
                status: "active",
                is_waiting_reply: true,
              })
              .select()
              .single();
            conversation = newConv;
            console.log("Created conversation:", conversation?.id, "for", normalizedPhone);
          }

          if (conversation) {
            await supabase.from("messages").insert({
              conversation_id: conversation.id,
              role: "assistant",
              content: message,
            });
          }

          await supabase
            .from("blast_contacts")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", contact.id);
          sentCount++;
        } else {
          const errText = await res.text();
          await supabase
            .from("blast_contacts")
            .update({ status: "error", error_message: errText.slice(0, 255) })
            .eq("id", contact.id);
          errorCount++;
        }

        const baseDelay = intervalSeconds * 1000;
        const variation = baseDelay * 0.2;
        const delay = baseDelay + (Math.random() * variation * 2 - variation);
        await new Promise((r) => setTimeout(r, delay));

        if (sentCount + errorCount > 5 && errorCount / (sentCount + errorCount) > 0.2) {
          await supabase
            .from("blast_campaigns")
            .update({ status: "error" })
            .eq("id", campaign_id);
          break;
        }
      } catch (e) {
        console.error("Contact send error:", e);
        await supabase
          .from("blast_contacts")
          .update({ status: "error", error_message: (e as Error).message?.slice(0, 255) })
          .eq("id", contact.id);
        errorCount++;
      }
    }

    await supabase
      .from("blast_campaigns")
      .update({
        sent_count: campaign.sent_count + sentCount,
        error_count: campaign.error_count + errorCount,
      })
      .eq("id", campaign_id);

    const { count } = await supabase
      .from("blast_contacts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id)
      .eq("status", "pending");

    if (!count || count === 0) {
      await supabase
        .from("blast_campaigns")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", campaign_id);
    }

    return new Response(
      JSON.stringify({ ok: true, sent: sentCount, errors: errorCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Blast processor error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
