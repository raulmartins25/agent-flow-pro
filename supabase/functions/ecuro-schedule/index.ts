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
    const {
      agent_id, conversation_id,
      start_time, end_time,
      patient_name, patient_phone, patient_cpf, patient_email, patient_birthdate,
    } = body || {};

    if (!agent_id || !start_time || !patient_name || !patient_phone) {
      return new Response(JSON.stringify({ error: 'agent_id, start_time, patient_name, patient_phone required' }), {
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

    const cfg = integ.config as {
      clinic_id: string;
      specialty_id: string;
      default_duration?: number;
      environment?: 'dev' | 'prod';
    };
    const env = cfg.environment === 'prod' ? 'prod' : 'dev';
    const duration = cfg.default_duration || 30;

    const start = new Date(start_time);
    const end = end_time ? new Date(end_time) : new Date(start.getTime() + duration * 60000);

    const payload = {
      clinicId: cfg.clinic_id,
      specialtyId: cfg.specialty_id,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      patient: {
        name: patient_name,
        phone: patient_phone,
        cpf: patient_cpf,
        email: patient_email,
        birthdate: patient_birthdate,
      },
    };

    const res = await ecuroFetch(env, '/create-appointment-webhook', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }

    // Log into conversation messages for traceability
    if (conversation_id) {
      await supabase.from('messages').insert({
        conversation_id,
        role: 'system',
        content: res.ok
          ? `[Ecuro] Agendamento criado: ${start.toLocaleString('pt-BR')} — ${JSON.stringify(data)}`
          : `[Ecuro] Falha agendamento (${res.status}): ${JSON.stringify(data)}`,
      });
    }

    if (!res.ok) {
      return new Response(JSON.stringify({ success: false, error: 'Ecuro schedule failed', status: res.status, body: data }), {
        status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, appointment: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('ecuro-schedule error', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
