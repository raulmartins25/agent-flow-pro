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

    const baseUrl = device.evolution_api_url.replace(/\/+$/, "");
    const apiKey = device.evolution_api_key;
    const instanceName = device.instance_name;

    let qrCode = null;

    const stateRes = await fetch(`${baseUrl}/instance/connectionState/${instanceName}`, {
      headers: { apikey: apiKey },
    });

    if (!stateRes.ok) {
      const createRes = await fetch(`${baseUrl}/instance/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({
          instanceName,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        }),
      });

      if (createRes.ok) {
        const createData = await createRes.json();
        qrCode = createData?.qrcode?.base64 || createData?.base64 || null;
        await setWebhook(baseUrl, apiKey, instanceName);
      }
    } else {
      const stateData = await stateRes.json();
      if (stateData?.instance?.state === "open") {
        await setWebhook(baseUrl, apiKey, instanceName);

        await supabase.from("devices").update({
          status: "connected",
          qr_code: null,
          last_connected_at: new Date().toISOString(),
        }).eq("id", device_id);

        return new Response(JSON.stringify({ status: "connected", qr_code: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!qrCode) {
      const connectRes = await fetch(`${baseUrl}/instance/connect/${instanceName}`, {
        headers: { apikey: apiKey },
      });

      if (connectRes.ok) {
        const connectData = await connectRes.json();
        qrCode = connectData?.base64 || connectData?.qrcode?.base64 || null;
      }
    }

    await supabase.from("devices").update({
      status: "connecting",
      qr_code: qrCode,
    }).eq("id", device_id);

    return new Response(JSON.stringify({ status: "connecting", qr_code: qrCode }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Device connect error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
