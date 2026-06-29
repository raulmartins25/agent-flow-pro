import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

Deno.serve(async (_req) => {
  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: agent } = await supa.from('agents').select('prompt_compiled, llm_model').eq('id', '9d01e0ff-9bf3-4fe5-8979-cd10e692ec6e').single();
  const key = Deno.env.get('OPENAI_API_KEY')!;
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: agent?.llm_model || 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: agent!.prompt_compiled },
        { role: 'user', content: 'oi, qual é o endereço da clínica?' },
      ],
    }),
  });
  const j = await r.json();
  return new Response(JSON.stringify({ reply: j.choices?.[0]?.message?.content, raw: j.error }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
});
