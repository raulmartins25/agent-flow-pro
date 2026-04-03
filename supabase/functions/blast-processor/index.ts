import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      .select("*, agents(evolution_api_url, evolution_api_key, evolution_instance, prompt_compiled, type)")
      .eq("id", campaign_id)
      .single();

    if (!campaign || !campaign.agents) {
      return new Response(JSON.stringify({ error: "Campaign or agent not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update campaign status
    await supabase
      .from("blast_campaigns")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", campaign_id);

    // Get pending contacts in batches
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
    const agent = campaign.agents;

    for (const contact of contacts) {
      try {
        // Check if campaign is still running
        const { data: currentCampaign } = await supabase
          .from("blast_campaigns")
          .select("status")
          .eq("id", campaign_id)
          .single();

        if (currentCampaign?.status === "paused" || currentCampaign?.status === "completed") {
          break;
        }

        // Send message via Evolution API
        const message = (agent.prompt_compiled || "Olá!")
          .replace("{{nome_contato}}", contact.name || "");

        const res = await fetch(
          `${agent.evolution_api_url}/message/sendText/${agent.evolution_instance}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: agent.evolution_api_key || "",
            },
            body: JSON.stringify({
              number: contact.phone,
              text: message,
            }),
          }
        );

        if (res.ok) {
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

        // Anti-ban: random delay ±20%
        const baseDelay = intervalSeconds * 1000;
        const variation = baseDelay * 0.2;
        const delay = baseDelay + (Math.random() * variation * 2 - variation);
        await new Promise((r) => setTimeout(r, delay));

        // Anti-ban: stop if error rate > 20%
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

    // Update campaign counts
    await supabase
      .from("blast_campaigns")
      .update({
        sent_count: campaign.sent_count + sentCount,
        error_count: campaign.error_count + errorCount,
      })
      .eq("id", campaign_id);

    // Check if there are more pending contacts
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
