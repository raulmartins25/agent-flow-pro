import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.49.4/cors";

const CONNECT_URL = "https://webhook.automindhub.com.br/webhook/jp-connect";
const DISCONNECT_URL = "https://webhook.automindhub.com.br/webhook/jp-disconnect";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, provider, url, instancia, token } = await req.json();

    if (action === "connect") {
      if (!provider || !url) {
        return new Response(JSON.stringify({ error: "provider e url são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body: Record<string, string> = { provider, url };
      if (instancia) body.instancia = instancia;
      if (token) body.token = token;

      const apiRes = await fetch(CONNECT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const apiData = await apiRes.json();

      // Save to DB
      await supabase.from("chip_warmups").insert({
        user_id: user.id,
        provider,
        api_url: url,
        instance_name: instancia || null,
        token: token || null,
        status: "connected",
      });

      return new Response(JSON.stringify({ success: true, api_response: apiData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      if (!url) {
        return new Response(JSON.stringify({ error: "url é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body: Record<string, string> = { url };
      if (instancia) body.instancia = instancia;

      const apiRes = await fetch(DISCONNECT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const apiData = await apiRes.json();

      // Update status in DB
      let query = supabase
        .from("chip_warmups")
        .update({ status: "disconnected" })
        .eq("user_id", user.id)
        .eq("api_url", url);

      if (instancia) {
        query = query.eq("instance_name", instancia);
      }

      await query;

      return new Response(JSON.stringify({ success: true, api_response: apiData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida. Use 'connect' ou 'disconnect'" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
