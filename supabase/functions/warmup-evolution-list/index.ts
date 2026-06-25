import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    const body = await req.json().catch(() => ({}));
    const { server_id, url: rawUrl, api_key: rawKey } = body as {
      server_id?: string; url?: string; api_key?: string;
    };

    let url = rawUrl?.trim();
    let apiKey = rawKey?.trim();

    if (server_id) {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: srv, error } = await admin
        .from("warmup_evolution_servers")
        .select("evolution_api_url, evolution_api_key")
        .eq("id", server_id)
        .eq("user_id", user.id)
        .single();
      if (error || !srv) {
        return new Response(JSON.stringify({ error: "Servidor não encontrado" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      url = srv.evolution_api_url;
      apiKey = srv.evolution_api_key;
    }

    if (!url || !apiKey) {
      return new Response(JSON.stringify({ error: "url e api_key são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const base = url.replace(/\/+$/, "");
    const evoRes = await fetch(`${base}/instance/fetchInstances`, {
      headers: { apikey: apiKey, "Content-Type": "application/json" },
    });
    const text = await evoRes.text();
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { raw = text; }

    if (!evoRes.ok) {
      return new Response(JSON.stringify({ error: "Falha ao listar instâncias", status: evoRes.status, detail: raw }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize across Evolution API versions
    const arr = Array.isArray(raw) ? raw : [];
    const instances = arr.map((item: any) => {
      const inst = item?.instance ?? item ?? {};
      const name = inst.instanceName ?? inst.name ?? item?.name ?? null;
      const status = inst.status ?? item?.connectionStatus ?? item?.status ?? null;
      const number = inst.owner ?? inst.number ?? item?.ownerJid ?? item?.number ?? null;
      const profileName = inst.profileName ?? item?.profileName ?? null;
      const token = item?.hash?.apikey ?? item?.token ?? inst.apikey ?? null;
      return { name, status, number, profileName, token };
    }).filter((i) => i.name);

    return new Response(JSON.stringify({ instances }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
