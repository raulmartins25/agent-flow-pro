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
    const { appointment_id, external_id, agent_id, conversation_id } = body || {};

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

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

    // Skip se o agendamento local já está inativo
    if (['cancelled', 'completed', 'no_show'].includes(String(appt.status))) {
      if (conversation_id) {
        await supabase.from('messages').insert({
          conversation_id, role: 'system',
          content: `[Ecuro] SKIP_confirm: status=${appt.status}, id=${appt.id}`,
        });
      }
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'appointment_inactive' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!appt.external_id) {
      return new Response(JSON.stringify({ ok: true, note: 'no external_id, nothing to confirm on Ecuro' }), {
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

    // Skip se o ambiente em que o agendamento foi criado é diferente do atual
    if (appt.ecuro_environment && appt.ecuro_environment !== env) {
      if (conversation_id) {
        await supabase.from('messages').insert({
          conversation_id, role: 'system',
          content: `[Ecuro] SKIP_confirm: env_mismatch (criado=${appt.ecuro_environment}, atual=${env}), id=${appt.id}`,
        });
      }
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'env_mismatch' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    const payload = {
      id: appt.external_id,
      ecuro_clinic_id: cfg.clinic_id,
      status: 'CONFIRMED',
      comments: 'Confirmado pelo paciente via WhatsApp',
    };

    const res = await ecuroFetch(env, '/update-appointment', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }

    if (conversation_id) {
      await supabase.from('messages').insert({
        conversation_id,
        role: 'system',
        content: res.ok
          ? `[Ecuro] Agendamento ${appt.external_id} confirmado (PUT /update-appointment)`
          : `[Ecuro] Falha ao confirmar (${res.status}): ${typeof data === 'string' ? data : JSON.stringify(data)}`,
      });
    }

    return new Response(JSON.stringify({
      ok: res.ok,
      status: res.status,
      ecuro: data,
    }), {
      status: res.ok ? 200 : res.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('ecuro-confirm error', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
