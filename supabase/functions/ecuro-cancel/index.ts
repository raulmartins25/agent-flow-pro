import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { ecuroFetch } from '../_shared/ecuro.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { appointment_id, external_id, agent_id, reason, conversation_id } = body || {};

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Resolve appointment
    let appt: any = null;
    if (appointment_id) {
      const { data } = await supabase.from('appointments').select('*').eq('id', appointment_id).maybeSingle();
      appt = data;
    } else if (external_id) {
      const { data } = await supabase.from('appointments').select('*').eq('external_id', external_id).maybeSingle();
      appt = data;
    }
    if (!appt) {
      return new Response(JSON.stringify({ error: 'appointment not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!appt.external_id) {
      // Nothing on Ecuro side — just mark cancelled locally
      await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id);
      return new Response(JSON.stringify({ ok: true, note: 'no external_id, only local cancel' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aid = agent_id || appt.agent_id;
    const { data: integ } = await supabase
      .from('agent_integrations')
      .select('config, enabled')
      .eq('agent_id', aid)
      .eq('provider', 'ecuro')
      .maybeSingle();

    if (!integ || !integ.enabled) {
      return new Response(JSON.stringify({ error: 'Ecuro integration not configured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cfg = integ.config as { clinic_id: string; environment?: 'dev' | 'prod' };
    const env = cfg.environment === 'prod' ? 'prod' : 'dev';

    const payload = {
      type: 'APPOINTMENT_CANCELED',
      data: {
        ecuro_clinic_id: cfg.clinic_id,
        appointment_id: appt.external_id,
        id: appt.external_id,
        cancellation_reason: reason || 'Cancelado pelo paciente via WhatsApp',
      },
    };

    // Try canonical endpoint first; fallback to alternatives if 404
    const endpoints = [
      '/cancel-appointment-webhook',
      '/appointment-cancel-webhook',
      '/cancel-appointment',
    ];
    let res: Response | null = null;
    let text = '';
    let usedPath = '';
    for (const p of endpoints) {
      res = await ecuroFetch(env, p, { method: 'POST', body: JSON.stringify(payload) });
      text = await res.text();
      usedPath = p;
      if (res.status !== 404) break;
    }
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }

    if (res && res.ok) {
      await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id);
    }

    if (conversation_id) {
      await supabase.from('messages').insert({
        conversation_id,
        role: 'system',
        content: res && res.ok
          ? `[Ecuro] Agendamento ${appt.external_id} cancelado via ${usedPath}`
          : `[Ecuro] Falha ao cancelar (${res?.status}) via ${usedPath}: ${typeof data === 'string' ? data : JSON.stringify(data)}`,
      });
    }

    return new Response(JSON.stringify({
      ok: res?.ok ?? false,
      status: res?.status,
      endpoint: usedPath,
      ecuro: data,
    }), {
      status: res?.ok ? 200 : (res?.status || 500),
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('ecuro-cancel error', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
