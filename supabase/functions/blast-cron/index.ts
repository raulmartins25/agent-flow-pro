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

    // 1. Find scheduled campaigns that are due
    const { data: scheduled } = await supabase
      .from("blast_campaigns")
      .select("id")
      .eq("status", "pending")
      .not("scheduled_at", "is", null)
      .lte("scheduled_at", new Date().toISOString());

    // 2. Find running campaigns that still have pending contacts (auto-continuation)
    const { data: running } = await supabase
      .from("blast_campaigns")
      .select("id")
      .eq("status", "running");

    const campaignsToProcess: string[] = [];

    if (scheduled) campaignsToProcess.push(...scheduled.map(c => c.id));

    if (running) {
      for (const camp of running) {
        const { count } = await supabase
          .from("blast_contacts")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", camp.id)
          .eq("status", "pending");
        if (count && count > 0) campaignsToProcess.push(camp.id);
      }
    }

    console.log(`Blast cron: ${campaignsToProcess.length} campaigns to process`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    for (const campaignId of campaignsToProcess) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/blast-processor`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ campaign_id: campaignId }),
        });
        console.log(`Triggered blast-processor for campaign ${campaignId}`);
      } catch (e) {
        console.error(`Failed to trigger campaign ${campaignId}:`, e);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: campaignsToProcess.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Blast cron error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
