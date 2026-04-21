import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { ecuroFetch } from '../_shared/ecuro.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function fmtPtBr(iso: string): string {
  const d = new Date(iso);
  const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const dia = dias[d.getDay()];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dia} ${dd}/${mm} às ${hh}:${mi}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { agent_id, start_date, end_date } = body || {};
    if (!agent_id) {
      return new Response(JSON.stringify({ error: 'agent_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: integ, error } = await supabase
      .from('agent_integrations')
      .select('config, enabled')
      .eq('agent_id', agent_id)
      .eq('provider', 'ecuro')
      .maybeSingle();

    if (error || !integ || !integ.enabled) {
      return new Response(JSON.stringify({ error: 'Ecuro integration not configured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cfg = integ.config as { clinic_id: string; specialty_id: string; environment?: 'dev' | 'prod' };
    const env = cfg.environment === 'prod' ? 'prod' : 'dev';

    const today = new Date();
    const future = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sd = start_date || today.toISOString().slice(0, 10);
    const ed = end_date || future.toISOString().slice(0, 10);

    const qs = new URLSearchParams({
      clinicId: cfg.clinic_id,
      specialtyId: cfg.specialty_id,
      startDate: sd,
      endDate: ed,
    }).toString();
    const res = await ecuroFetch(env, `/specialty-availability?${qs}`, { method: 'GET' });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'Ecuro availability failed', status: res.status, body: data }), {
        status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalize into list of slots
    const slots: Array<{ start: string; end: string; label: string }> = [];
    const list = Array.isArray(data) ? data : (data?.slots || data?.availability || []);
    for (const s of list) {
      const start = s.start || s.startTime || s.start_time;
      const end = s.end || s.endTime || s.end_time;
      if (start) slots.push({ start, end: end || start, label: fmtPtBr(start) });
    }

    return new Response(JSON.stringify({ slots: slots.slice(0, 20), raw: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('ecuro-availability error', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
