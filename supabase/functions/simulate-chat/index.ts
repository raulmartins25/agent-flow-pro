import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, prompt, llm_provider, llm_model, llm_api_key } = await req.json();

    const allMessages = [
      { role: "system", content: prompt },
      ...messages,
    ];

    let aiResponse = "";

    if (llm_provider === "claude" || !llm_provider) {
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

      if (!res.ok) {
        const t = await res.text();
        if (res.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (res.status === 402) {
          return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error(`AI error ${res.status}: ${t}`);
      }
      const data = await res.json();
      aiResponse = data.choices?.[0]?.message?.content || "";
    } else if (llm_provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${llm_api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: llm_model || "gpt-4o", messages: allMessages }),
      });
      const data = await res.json();
      aiResponse = data.choices?.[0]?.message?.content || "";
    } else if (llm_provider === "deepseek") {
      const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${llm_api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: llm_model || "deepseek-chat", messages: allMessages }),
      });
      const data = await res.json();
      aiResponse = data.choices?.[0]?.message?.content || "";
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
