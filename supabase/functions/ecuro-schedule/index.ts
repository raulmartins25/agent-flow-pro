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

    const cfgAny2 = cfg as any;
    const payload = {
      type: 'APPOINTMENT_CREATED',
      data: {
        ecuro_clinic_id: cfg.clinic_id,
        specialty: cfg.specialty_id,
        specialty_id: cfg.specialty_id,
        speciality_id: cfg.specialty_id,
        description: 'Consulta agendada via WhatsApp',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        customer: {
          name: patient_name,
          email: patient_email,
          phone: patient_phone,
          cpf: patient_cpf,
          birthdate: patient_birthdate,
        },
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

    // Persist appointment for reminder system
    if (res.ok) {
      try {
        const { data: agentRow } = await supabase
          .from('agents').select('user_id').eq('id', agent_id).maybeSingle();
        let convDeviceId: string | null = null;
        let convContactName: string | null = null;
        if (conversation_id) {
          const { data: convRow } = await supabase
            .from('conversations').select('device_id, contact_name')
            .eq('id', conversation_id).maybeSingle();
          convDeviceId = convRow?.device_id || null;
          convContactName = convRow?.contact_name || null;
        }
        const cfgAny = cfg as any;
        const appt = (data && typeof data === 'object')
          ? (data.data?.appointment || data.appointment || data.data || data)
          : null;
        const externalId = appt
          ? (appt.id || appt.appointmentId || appt.appointment_id || appt._id || null)
          : null;
        await supabase.from('appointments').insert({
          user_id: agentRow?.user_id,
          agent_id,
          conversation_id: conversation_id || null,
          device_id: convDeviceId,
          contact_number: patient_phone,
          contact_name: patient_name || convContactName,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          clinic_name: cfgAny.clinic_name || null,
          specialty_name: cfgAny.specialty_name || null,
          external_id: externalId ? String(externalId) : null,
        });
      } catch (insErr) {
        console.error('appointments insert failed', insErr);
      }
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
