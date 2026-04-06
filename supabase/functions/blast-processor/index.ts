import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROCESSING_LOCK_PREFIX = "processing:";
const PROCESSING_LOCK_TTL_MS = 10 * 60 * 1000;

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
      .select("*, agents(id, prompt_compiled, type, device_id, agent_config(first_prospecting_message, prospecting_messages, agent_persona_name, company_name), devices(id, evolution_api_url, evolution_api_key, instance_name, status))")
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
    const executionId = crypto.randomUUID();
    const staleClaimBefore = new Date(Date.now() - PROCESSING_LOCK_TTL_MS).toISOString();

    await supabase
      .from("blast_contacts")
      .update({ sent_at: null, error_message: null })
      .eq("campaign_id", campaign_id)
      .eq("status", "pending")
      .like("error_message", `${PROCESSING_LOCK_PREFIX}%`)
      .lt("sent_at", staleClaimBefore);

    const { data: contacts } = await supabase
      .from("blast_contacts")
      .select("*")
      .eq("campaign_id", campaign_id)
      .eq("status", "pending")
      .is("sent_at", null)
      .limit(batchSize);

    if (!contacts || contacts.length === 0) {
      const { count: pendingCount } = await supabase
        .from("blast_contacts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign_id)
        .eq("status", "pending");

      if (!pendingCount || pendingCount === 0) {
        await supabase
          .from("blast_campaigns")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", campaign_id);
      }

      return new Response(JSON.stringify({ ok: true, message: pendingCount ? "Batch already being processed" : "No pending contacts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sentCount = 0;
    let errorCount = 0;
    const agentConfig = agent.agent_config?.[0];
    const agentPersonaName = agentConfig?.agent_persona_name?.trim() || "";
    const companyName = agentConfig?.company_name?.trim() || "";

    // Resolve messages array with fallback
    const prospectingMessages: string[] =
      Array.isArray(agentConfig?.prospecting_messages) && agentConfig.prospecting_messages.length > 0
        ? agentConfig.prospecting_messages.filter((m: string) => typeof m === 'string' && m.trim())
        : agentConfig?.first_prospecting_message
          ? [agentConfig.first_prospecting_message]
          : [];

    if (prospectingMessages.length === 0) {
      await supabase.from("blast_campaigns").update({ status: "error" }).eq("id", campaign_id);
      return new Response(JSON.stringify({ error: "Agente sem mensagem de disparo configurada" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get phones already sent in this campaign (cross-batch dedup)
    const { data: alreadySent } = await supabase
      .from("blast_contacts")
      .select("phone")
      .eq("campaign_id", campaign_id)
      .not("sent_at", "is", null);
    const sentPhones = new Set<string>(
      (alreadySent || []).map((c: any) => canonicalPhone(c.phone))
    );

    for (const contact of contacts) {
      // Skip duplicate phones
      const normalizedCheck = canonicalPhone(contact.phone);

      // --- BLACKLIST CHECK ---
      const { data: blRows } = await supabase
        .from("blacklist")
        .select("id, phone")
        .eq("user_id", campaign.user_id)
        .eq("device_id", device.id);

      const isBlacklisted = (blRows || []).some(
        (b: any) => canonicalPhone(b.phone) === normalizedCheck
      );

      if (isBlacklisted) {
        await supabase.from("blast_contacts").update({
          status: "error",
          error_message: "Número na blacklist",
        }).eq("id", contact.id);
        errorCount++;
        console.log(`Número ${normalizedCheck} na blacklist — pulando`);
        continue;
      }

      if (sentPhones.has(normalizedCheck)) {
        await supabase
          .from("blast_contacts")
          .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
          .eq("id", contact.id)
          .eq("status", "pending");
        sentCount++;
        console.log("Skipped duplicate phone:", normalizedCheck);
        continue;
      }

      try {
        const claimStartedAt = new Date().toISOString();
        const { data: claimedContact, error: claimError } = await supabase
          .from("blast_contacts")
          .update({
            sent_at: claimStartedAt,
            error_message: `${PROCESSING_LOCK_PREFIX}${executionId}`,
          })
          .eq("id", contact.id)
          .eq("campaign_id", campaign_id)
          .eq("status", "pending")
          .is("sent_at", null)
          .select("id")
          .maybeSingle();

        if (claimError) {
          console.error("Contact claim error:", claimError);
          continue;
        }

        if (!claimedContact) {
          console.log("Contact already claimed, skipping:", contact.id);
          continue;
        }

        sentPhones.add(normalizedCheck);

        const { data: currentCampaign } = await supabase
          .from("blast_campaigns")
          .select("status")
          .eq("id", campaign_id)
          .single();

        if (currentCampaign?.status === "paused" || currentCampaign?.status === "completed") {
          await supabase
            .from("blast_contacts")
            .update({ sent_at: null, error_message: null })
            .eq("id", contact.id)
            .eq("status", "pending");
          break;
        }

        // Select random variation
        const randomIndex = Math.floor(Math.random() * prospectingMessages.length);
        const selectedMessage = prospectingMessages[randomIndex];

        const message = selectedMessage
          .replace(/\{\{nome_contato\}\}/g, contact.name?.trim() || "")
          .replace(/\{\{nome_agente\}\}/g, agentPersonaName)
          .replace(/\{\{empresa\}\}/g, companyName);

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

          const mergedMetadata = contact.metadata && typeof contact.metadata === "object" && !Array.isArray(contact.metadata)
            ? { ...contact.metadata, message_variation_index: randomIndex }
            : { message_variation_index: randomIndex };

          await supabase
            .from("blast_contacts")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              error_message: null,
              metadata: mergedMetadata,
            } as any)
            .eq("id", contact.id);
          sentCount++;
        } else {
          const errText = await res.text();
          await supabase
            .from("blast_contacts")
            .update({ status: "error", sent_at: null, error_message: errText.slice(0, 255) })
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
          .update({ status: "error", sent_at: null, error_message: (e as Error).message?.slice(0, 255) })
          .eq("id", contact.id);
        errorCount++;
      }
    }

    // Recount actual totals from blast_contacts (eliminates race conditions)
    const { count: actualSent } = await supabase
      .from("blast_contacts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id)
      .eq("status", "sent");

    const { count: actualErrors } = await supabase
      .from("blast_contacts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id)
      .eq("status", "error");

    const { count: actualPending } = await supabase
      .from("blast_contacts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id)
      .eq("status", "pending");

    await supabase
      .from("blast_campaigns")
      .update({
        sent_count: actualSent || 0,
        error_count: actualErrors || 0,
      })
      .eq("id", campaign_id);

    if (!actualPending || actualPending === 0) {
      await supabase
        .from("blast_campaigns")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", campaign_id);
    } else {
      // Auto-continuation: self-invoke for next batch
      const { data: statusCheck } = await supabase
        .from("blast_campaigns")
        .select("status")
        .eq("id", campaign_id)
        .single();

      if (statusCheck?.status === "running") {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        // Small delay before re-invoking to avoid tight loops
        await new Promise((r) => setTimeout(r, 2000));
        fetch(`${supabaseUrl}/functions/v1/blast-processor`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ campaign_id }),
        }).catch((e) => console.error("Auto-continuation error:", e));
        console.log("Auto-continuation triggered for campaign", campaign_id);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent: sentCount, errors: errorCount, remaining: actualPending || 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Blast processor error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
