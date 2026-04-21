import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeDeepseekModel(model?: string | null): string {
  if (!model) return "deepseek-chat";
  const m = model.toLowerCase().trim();
  if (m === "deepseek-chat" || m === "deepseek-reasoner") return m;
  if (m.includes("reason") || m === "deepseek-r1") return "deepseek-reasoner";
  return "deepseek-chat";
}

function normalizeOpenAIModel(model?: string | null): string {
  if (!model || !model.trim()) return "gpt-4o-mini";
  return model;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { token, messages } = await req.json();
    if (!token || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "token e messages obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: share } = await supabase
      .from("simulator_shares")
      .select("agent_id")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (!share) {
      return new Response(JSON.stringify({ error: "Link expirado ou inválido" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: agent } = await supabase
      .from("agents")
      .select("prompt_compiled, llm_provider, llm_model, llm_api_key")
      .eq("id", share.agent_id)
      .maybeSingle();

    if (!agent) {
      return new Response(JSON.stringify({ error: "Agente não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allMessages = [
      { role: "system", content: agent.prompt_compiled || "" },
      ...messages,
    ];

    const provider = agent.llm_provider || "claude";
    console.log(`[public-simulator-chat] provider=${provider} model=${agent.llm_model}`);

    let aiResponse = "";

    if (provider === "deepseek") {
      if (!agent.llm_api_key) {
        return new Response(JSON.stringify({ error: "DeepSeek API key não configurada no agente." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const model = normalizeDeepseekModel(agent.llm_model);
      const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${agent.llm_api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: allMessages }),
      });
      const text = await res.text();
      console.log(`[public-simulator-chat] deepseek status=${res.status}`);
      if (!res.ok) {
        return new Response(JSON.stringify({ error: `DeepSeek ${res.status}: ${text.slice(0, 500)}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const data = JSON.parse(text);
      aiResponse = data.choices?.[0]?.message?.content || "";
    } else if (provider === "openai") {
      if (!agent.llm_api_key) {
        return new Response(JSON.stringify({ error: "OpenAI API key não configurada no agente." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const model = normalizeOpenAIModel(agent.llm_model);
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${agent.llm_api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: allMessages }),
      });
      const text = await res.text();
      if (!res.ok) {
        return new Response(JSON.stringify({ error: `OpenAI ${res.status}: ${text.slice(0, 500)}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const data = JSON.parse(text);
      aiResponse = data.choices?.[0]?.message?.content || "";
    } else {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: allMessages, stream: false }),
      });
      const text = await res.text();
      if (!res.ok) {
        if (res.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit excedido." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (res.status === 402) {
          return new Response(JSON.stringify({ error: "Créditos esgotados na Lovable AI." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: `Lovable AI ${res.status}: ${text.slice(0, 500)}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const data = JSON.parse(text);
      aiResponse = data.choices?.[0]?.message?.content || "";
    }

    if (!aiResponse) {
      return new Response(JSON.stringify({ error: "Resposta vazia do modelo" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ response: aiResponse }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("public-simulator-chat error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
