import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONNECT_URL = "https://webhook.automindhub.com.br/webhook/criainstanciaraul";
const DISCONNECT_URL = "https://webhook.automindhub.com.br/webhook/apagainstanciaraul";

const BASIC_USER = "raul";
const BASIC_PASS = "1xeuj9GyER1NhXyr";
const basicAuth = "Basic " + btoa(`${BASIC_USER}:${BASIC_PASS}`);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, device_id, warmup_instance_id } = body;
    let { provider, url, instancia, token } = body;

    // Native Evolution: resolve from device_id OR warmup_instance_id
    if (device_id || warmup_instance_id) {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      if (device_id) {
        const { data: device } = await admin
          .from("devices")
          .select("*")
          .eq("id", device_id)
          .eq("user_id", user.id)
          .single();
        if (!device) {
          return new Response(JSON.stringify({ error: "Dispositivo não encontrado" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        provider = "evolution";
        url = device.evolution_api_url;
        instancia = device.instance_name;
        token = device.evolution_api_key;
      } else {
        const { data: inst } = await admin
          .from("warmup_evolution_instances")
          .select("*")
          .eq("id", warmup_instance_id)
          .eq("user_id", user.id)
          .single();
        if (!inst) {
          return new Response(JSON.stringify({ error: "Instância de aquecimento não encontrada" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        provider = "evolution";
        url = inst.evolution_api_url;
        instancia = inst.instance_name;
        token = inst.evolution_api_key;
      }
    }

    if (action === "connect") {
      if (!provider || !url || !instancia || !token) {
        return new Response(JSON.stringify({ error: "provider, url, instancia e token são obrigatórios" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const apiRes = await fetch(CONNECT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: basicAuth },
        body: JSON.stringify({ provider, url, instancia, token }),
      });
      const apiText = await apiRes.text();
      let apiData: unknown;
      try { apiData = JSON.parse(apiText); } catch { apiData = { raw: apiText }; }

      if (!apiRes.ok) {
        return new Response(JSON.stringify({ error: "Falha no maturador", api_response: apiData }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("chip_warmups").insert({
        user_id: user.id,
        provider,
        api_url: url,
        instance_name: instancia,
        token,
        status: "connected",
      });

      return new Response(JSON.stringify({ success: true, api_response: apiData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      if (!url || !instancia) {
        return new Response(JSON.stringify({ error: "url e instancia são obrigatórios" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const apiRes = await fetch(DISCONNECT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: basicAuth },
        body: JSON.stringify({ url, instancia }),
      });
      const apiText = await apiRes.text();
      let apiData: unknown;
      try { apiData = JSON.parse(apiText); } catch { apiData = { raw: apiText }; }

      await supabase
        .from("chip_warmups")
        .update({ status: "disconnected" })
        .eq("user_id", user.id)
        .eq("api_url", url)
        .eq("instance_name", instancia);

      return new Response(JSON.stringify({ success: true, api_response: apiData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
