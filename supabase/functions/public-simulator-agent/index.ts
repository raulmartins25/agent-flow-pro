import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ error: "token obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: share } = await supabase
      .from("simulator_shares")
      .select("agent_id, expires_at")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (!share) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: agent } = await supabase
      .from("agents")
      .select("id, name, type")
      .eq("id", share.agent_id)
      .maybeSingle();

    if (!agent) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: config } = await supabase
      .from("agent_config")
      .select("agent_persona_name, company_name, welcome_message, first_prospecting_message, qualification_questions")
      .eq("agent_id", share.agent_id)
      .maybeSingle();

    return new Response(JSON.stringify({ agent, config }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("public-simulator-agent error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
