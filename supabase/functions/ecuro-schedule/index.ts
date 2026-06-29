import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { ecuroFetch, isWithinBusinessHours, normalizeBusinessHours, brParts } from '../_shared/ecuro.ts';

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
      business_hours?: any;
    };
    const env = cfg.environment === 'prod' ? 'prod' : 'dev';
    const duration = cfg.default_duration || 30;
    const businessHours = normalizeBusinessHours(cfg.business_hours);

    const start = new Date(start_time);
    const end = end_time ? new Date(end_time) : new Date(start.getTime() + duration * 60000);

    // GUARD 0 — bloquear horários no passado (ou com menos de 5 min de antecedência)
    const nowMs = Date.now();
    const minStartMs = nowMs + 5 * 60 * 1000;
    if (isNaN(start.getTime()) || start.getTime() <= minStartMs) {
      const msg = 'Horário já passou ou está muito próximo do agora. Chame get_availability novamente e ofereça apenas horários futuros (mínimo 5 minutos de antecedência).';
      if (conversation_id) {
        await supabase.from('messages').insert({
          conversation_id, role: 'system',
          content: `[Ecuro] BLOQUEADO_horario_passado: tentativa de agendar ${start.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (agora=${new Date(nowMs).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}).`,
        });
      }
      return new Response(JSON.stringify({ success: false, error: 'start_in_past', message: msg }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GUARD 1 — respect clinic business hours (server-side trava contra alucinações do LLM)
    if (!isWithinBusinessHours(start.toISOString(), businessHours)) {
      const msg = 'Horário fora do expediente da clínica. Consulte a disponibilidade novamente e ofereça apenas horários retornados pela ferramenta get_availability.';
      if (conversation_id) {
        await supabase.from('messages').insert({
          conversation_id, role: 'system',
          content: `[Ecuro] BLOQUEADO: tentativa de agendar ${start.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} fora do expediente.`,
        });
      }
      return new Response(JSON.stringify({ success: false, error: 'outside_business_hours', message: msg }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GUARD 2 — confirmar que o start_time corresponde a um slot realmente ofertado pela Ecuro
    try {
      const { date: brDate } = brParts(start.toISOString());
      const qs = new URLSearchParams({
        clinicId: cfg.clinic_id,
        specialtyId: cfg.specialty_id,
        startDate: brDate,
        endDate: brDate,
      }).toString();
      const availRes = await ecuroFetch(env, `/specialty-availability?${qs}`, { method: 'GET' });
      if (availRes.ok) {
        const availText = await availRes.text();
        let availData: any; try { availData = JSON.parse(availText); } catch { availData = null; }
        const dates = availData?.data?.dates || availData?.dates || [];
        const wantedMin = brParts(start.toISOString()).minutes;
        let matched = false;
        for (const d of dates) {
          if (d?.date !== brDate) continue;
          for (const h of (d.hours || [])) {
            const m = String(h?.start || '').match(/(\d{1,2}):(\d{2})/);
            if (!m) continue;
            const slotMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
            if (slotMin === wantedMin) { matched = true; break; }
          }
          if (matched) break;
        }
        if (!matched) {
          const msg = 'Horário não está disponível na agenda da clínica. Chame get_availability novamente e ofereça SOMENTE os slots retornados.';
          if (conversation_id) {
            await supabase.from('messages').insert({
              conversation_id, role: 'system',
              content: `[Ecuro] BLOQUEADO: ${start.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} não bate com nenhum slot ofertado para ${brDate}.`,
            });
          }
          return new Response(JSON.stringify({ success: false, error: 'slot_not_offered', message: msg }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    } catch (e) {
      console.error('[ecuro-schedule] availability cross-check failed', e);
      // não bloqueia em caso de falha do cross-check; business_hours já protegeu acima
    }



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

        // Extração robusta do external_id — varre vários caminhos comuns retornados pela Ecuro
        const BAD_IDS = new Set(['', 'null', 'undefined', '[object object]']);
        const pickId = (o: any): string | null => {
          if (!o || typeof o !== 'object') return null;
          const keys = ['id', 'appointmentId', 'appointment_id', '_id', 'external_id', 'uuid', 'appointmentUuid'];
          for (const k of keys) {
            const v = o[k];
            if (v == null) continue;
            const s = String(v).trim();
            if (s && !BAD_IDS.has(s.toLowerCase())) return s;
          }
          return null;
        };
        let externalId: string | null = null;
        if (data && typeof data === 'object') {
          const candidates = [
            data.data?.appointment, data.appointment,
            data.data, data,
          ];
          for (const c of candidates) {
            externalId = pickId(c);
            if (externalId) break;
          }
        }

        if (!externalId && conversation_id) {
          const truncated = (typeof data === 'string' ? data : JSON.stringify(data)).slice(0, 500);
          await supabase.from('messages').insert({
            conversation_id, role: 'system',
            content: `[Ecuro] AVISO_external_id_ausente: payload=${truncated}`,
          });
        }

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
          external_id: externalId,
          ecuro_environment: env,
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
