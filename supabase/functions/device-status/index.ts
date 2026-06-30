import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function setWebhook(baseUrl: string, apiKey: string, instanceName: string) {
  const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/evolution-webhook`;
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  try {
    const res = await fetch(`${normalizedBaseUrl}/webhook/set/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({
        webhook: {
          url: webhookUrl,
          enabled: true,
          webhookByEvents: false,
          webhookBase64: false,
          events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "MESSAGES_UPDATE"],
        },
      }),
    });

    const responseText = await res.text();

    if (!res.ok) {
      console.error(`Failed to set webhook for ${instanceName}: ${res.status} ${responseText}`);
      return;
    }

    console.log(`Webhook set for ${instanceName}: ${res.status} ${responseText}`);
  } catch (e) {
    console.error("Failed to set webhook:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { device_id } = await req.json();
    if (!device_id) {
      return new Response(JSON.stringify({ error: "device_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: device } = await supabase
      .from("devices")
      .select("*")
      .eq("id", device_id)
      .single();

    if (!device) {
      return new Response(JSON.stringify({ error: "Device not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let baseUrl = device.evolution_api_url.replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(baseUrl)) baseUrl = `https://${baseUrl}`;

    // --- Primary check: connectionState ---
    let state: string | null = null;
    try {
      const res = await fetch(
        `${baseUrl}/instance/connectionState/${encodeURIComponent(device.instance_name)}`,
        { headers: { apikey: device.evolution_api_key } }
      );
      if (res.ok) {
        const data = await res.json();
        state = data?.instance?.state ?? null;
      }
    } catch (e) {
      console.error("connectionState fetch failed:", e);
    }

    // --- Fallback/cross-check: fetchInstances (authoritative on Evolution v2) ---
    let phoneNumber = device.phone_number;
    let instanceFound = false;
    try {
      const infoRes = await fetch(
        `${baseUrl}/instance/fetchInstances`,
        { headers: { apikey: device.evolution_api_key } }
      );
      if (infoRes.ok) {
        const instances = await infoRes.json();
        if (Array.isArray(instances)) {
          const inst = instances.find((i: any) => {
            const nameV2 = i?.name;
            const nameV1 = i?.instance?.instanceName;
            return nameV1 === device.instance_name || nameV2 === device.instance_name;
          });
          if (inst) {
            instanceFound = true;
            // v2 shape: { name, connectionStatus, ownerJid }
            // v1 shape: { instance: { instanceName, state, owner } }
            const v2Status = inst?.connectionStatus;
            const v1State = inst?.instance?.state;
            const fetched = v2Status || v1State;
            if (fetched === "open" && state !== "open") state = "open";
            const owner = inst?.ownerJid || inst?.instance?.owner;
            if (owner) phoneNumber = String(owner).replace("@s.whatsapp.net", "");
          }
        }
      }
    } catch (e) {
      console.error("fetchInstances failed:", e);
    }

    if (!instanceFound && state === null) {
      await supabase.from("devices").update({ status: "error" }).eq("id", device_id);
      return new Response(JSON.stringify({ status: "error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (state === "open") {
      await setWebhook(baseUrl, device.evolution_api_key, device.instance_name);

      await supabase.from("devices").update({
        status: "connected",
        phone_number: phoneNumber,
        qr_code: null,
        last_connected_at: new Date().toISOString(),
      }).eq("id", device_id);

      return new Response(JSON.stringify({
        status: "connected", phone_number: phoneNumber, qr_code: null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("devices").update({ status: "disconnected" }).eq("id", device_id);
    return new Response(JSON.stringify({ status: "disconnected" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Device status error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
