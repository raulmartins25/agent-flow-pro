import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { conversation_id, agent, history, contact_number, instance_name } = await req.json();

    if (!agent?.prompt_compiled) {
      return new Response(JSON.stringify({ error: "No prompt configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messages = [
      { role: "system", content: agent.prompt_compiled },
      ...history.map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
    ];

    let aiResponse = "";

    // Use Lovable AI gateway for Claude, or direct API for others
    if (agent.llm_provider === "claude") {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, stream: false }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`AI gateway error ${res.status}: ${t}`);
      }
      const data = await res.json();
      aiResponse = data.choices?.[0]?.message?.content || "";
    } else if (agent.llm_provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${agent.llm_api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: agent.llm_model || "gpt-4o", messages }),
      });
      const data = await res.json();
      aiResponse = data.choices?.[0]?.message?.content || "";
    } else if (agent.llm_provider === "deepseek") {
      const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${agent.llm_api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: agent.llm_model || "deepseek-chat", messages }),
      });
      const data = await res.json();
      aiResponse = data.choices?.[0]?.message?.content || "";
    }

    if (!aiResponse) {
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save AI response
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await supabase.from("messages").insert({
      conversation_id,
      role: "assistant",
      content: aiResponse,
    });

    // Send via Evolution API
    const { data: agentFull } = await supabase
      .from("agents")
      .select("evolution_api_url, evolution_api_key, evolution_instance")
      .eq("id", agent.id)
      .single();

    if (agentFull) {
      await fetch(`${agentFull.evolution_api_url}/message/sendText/${agentFull.evolution_instance}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: agentFull.evolution_api_key || "",
        },
        body: JSON.stringify({
          number: contact_number,
          text: aiResponse,
        }),
      });
    }

    return new Response(JSON.stringify({ ok: true, response: aiResponse }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Process message error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
