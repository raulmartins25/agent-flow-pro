import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const res = await fetch(
      `${device.evolution_api_url}/instance/connectionState/${device.instance_name}`,
      { headers: { apikey: device.evolution_api_key } }
    );

    if (!res.ok) {
      await supabase.from("devices").update({ status: "error" }).eq("id", device_id);
      return new Response(JSON.stringify({ status: "error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const state = data?.instance?.state;

    if (state === "open") {
      // Try to get phone number from instance info
      let phoneNumber = device.phone_number;
      try {
        const infoRes = await fetch(
          `${device.evolution_api_url}/instance/fetchInstances`,
          { headers: { apikey: device.evolution_api_key } }
        );
        if (infoRes.ok) {
          const instances = await infoRes.json();
          const inst = Array.isArray(instances)
            ? instances.find((i: any) => i.instance?.instanceName === device.instance_name)
            : null;
          if (inst?.instance?.owner) {
            phoneNumber = inst.instance.owner.replace("@s.whatsapp.net", "");
          }
        }
      } catch {}

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
    } else {
      await supabase.from("devices").update({ status: "disconnected" }).eq("id", device_id);
      return new Response(JSON.stringify({ status: "disconnected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("Device status error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
