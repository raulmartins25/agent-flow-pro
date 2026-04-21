import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeDeepseekModel(model?: string | null): string {
  if (!model) return "deepseek-chat";
  const m = model.toLowerCase().trim();
  if (m === "deepseek-chat" || m === "deepseek-reasoner") return m;
  if (m.includes("reason") || m === "deepseek-r1") return "deepseek-reasoner";
  // deepseek-v3, deepseek-v3-chat, etc → deepseek-chat
  return "deepseek-chat";
}

function normalizeOpenAIModel(model?: string | null): string {
  if (!model || !model.trim()) return "gpt-4o-mini";
  return model;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, prompt, llm_provider, llm_model, llm_api_key } = await req.json();

    const allMessages = [
      { role: "system", content: prompt },
      ...messages,
    ];

    const provider = llm_provider || "claude";
    console.log(`[simulate-chat] provider=${provider} model=${llm_model} hasKey=${!!llm_api_key}`);

    let aiResponse = "";

    if (provider === "deepseek") {
      if (!llm_api_key) {
        return new Response(JSON.stringify({ error: "DeepSeek API key não configurada no agente." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const model = normalizeDeepseekModel(llm_model);
      console.log(`[simulate-chat] deepseek normalized model: ${model}`);
      const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${llm_api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: allMessages }),
      });
      const text = await res.text();
      console.log(`[simulate-chat] deepseek status=${res.status} body=${text.slice(0, 300)}`);
      if (!res.ok) {
        return new Response(JSON.stringify({ error: `DeepSeek ${res.status}: ${text.slice(0, 500)}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const data = JSON.parse(text);
      aiResponse = data.choices?.[0]?.message?.content || "";
      if (!aiResponse) {
        return new Response(JSON.stringify({ error: `DeepSeek retornou resposta vazia. Body: ${text.slice(0, 300)}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (provider === "openai") {
      if (!llm_api_key) {
        return new Response(JSON.stringify({ error: "OpenAI API key não configurada no agente." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const model = normalizeOpenAIModel(llm_model);
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${llm_api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: allMessages }),
      });
      const text = await res.text();
      console.log(`[simulate-chat] openai status=${res.status} body=${text.slice(0, 300)}`);
      if (!res.ok) {
        return new Response(JSON.stringify({ error: `OpenAI ${res.status}: ${text.slice(0, 500)}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const data = JSON.parse(text);
      aiResponse = data.choices?.[0]?.message?.content || "";
      if (!aiResponse) {
        return new Response(JSON.stringify({ error: `OpenAI retornou resposta vazia. Body: ${text.slice(0, 300)}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // claude / fallback → Lovable AI Gateway
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: allMessages,
          stream: false,
        }),
      });
      const text = await res.text();
      console.log(`[simulate-chat] lovable status=${res.status}`);
      if (!res.ok) {
        if (res.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit excedido. Tente novamente em instantes." }), {
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
      if (!aiResponse) {
        return new Response(JSON.stringify({ error: "Lovable AI retornou resposta vazia." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ response: aiResponse }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Simulate chat error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
