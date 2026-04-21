import { ecuroFetch } from '../_shared/ecuro.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const env = (url.searchParams.get('env') === 'prod' ? 'prod' : 'dev') as 'dev' | 'prod';
    const clinicId = url.searchParams.get('clinicId');

    const path = clinicId ? `/list-specialties?clinicId=${encodeURIComponent(clinicId)}` : '/list-specialties';
    const res = await ecuroFetch(env, path, { method: 'GET' });
    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'Ecuro API error', status: res.status, body: data }), {
        status: res.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ env, specialties: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('ecuro-list-specialties error', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
