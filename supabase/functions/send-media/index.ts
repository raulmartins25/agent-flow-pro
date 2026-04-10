import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { agent_id, contact_number, media_url, media_type, caption } = await req.json();

    if (!agent_id || !contact_number || !media_url) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch agent with device
    const { data: agent } = await supabase
      .from("agents")
      .select("*, devices(*)")
      .eq("id", agent_id)
      .single();

    if (!agent || !agent.devices) {
      return new Response(JSON.stringify({ error: "Agent or device not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const device = agent.devices;

    let endpoint = "sendMedia";
    const body: Record<string, any> = {
      number: contact_number,
      mediatype: media_type || "image",
      media: media_url,
    };

    if (media_type === "document") {
      endpoint = "sendMedia";
      body.mediatype = "document";
      body.fileName = caption || "document";
    }

    if (caption) body.caption = caption;

    let evoUrl = device.evolution_api_url.replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(evoUrl)) evoUrl = `https://${evoUrl}`;
    const res = await fetch(
      `${evoUrl}/message/${endpoint}/${device.instance_name}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: device.evolution_api_key || "",
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Evolution API error: ${errText}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Send media error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
