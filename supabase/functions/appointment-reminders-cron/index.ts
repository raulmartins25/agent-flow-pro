import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TZ = "America/Sao_Paulo";

function isBusinessHourBR(d: Date): boolean {
  // Mon-Fri, 08:00-18:00 in America/Sao_Paulo
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, weekday: "short", hour: "numeric", hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const wd = parts.find(p => p.type === "weekday")?.value || "";
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
  const businessDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  return businessDays.includes(wd) && hour >= 8 && hour < 18;
}

function formatBR(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, ...opts }).format(new Date(iso));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const businessNow = isBusinessHourBR(now);

    // Window: appointments within next 25h that still have a pending reminder
    const upper = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString();
    const { data: appts, error } = await supabase
      .from("appointments")
      .select("*, devices(*)")
      .eq("status", "scheduled")
      .gt("start_time", now.toISOString())
      .lt("start_time", upper);

    if (error) throw error;

    let sent = 0, skipped = 0;

    for (const a of appts || []) {
      const startMs = new Date(a.start_time).getTime();
      const diffMin = (startMs - now.getTime()) / 60000;
      const device = a.devices;

      // 2h reminder window: <= 2h, > 0
      if (diffMin <= 120 && diffMin > 0 && a.reminder_2h_status === "pending") {
        if (!businessNow) {
          await supabase.from("appointments").update({
            reminder_2h_status: "skipped", reminder_2h_sent_at: now.toISOString(),
          }).eq("id", a.id);
          skipped++;
        } else if (device && device.status === "connected") {
          const hora = formatBR(a.start_time, { hour: "2-digit", minute: "2-digit" });
          const nome = a.contact_name ? a.contact_name.split(" ")[0] : "tudo bem";
          const text = `Oi ${nome}! Sua consulta é hoje às ${hora}${a.clinic_name ? " na " + a.clinic_name : ""}. Posso confirmar sua presença? 😊`;
          await sendReminder(supabase, a, device, text);
          await supabase.from("appointments").update({
            reminder_2h_status: "sent", reminder_2h_sent_at: now.toISOString(),
          }).eq("id", a.id);
          sent++;
        }
        continue;
      }

      // 24h reminder window: <= 24h, > 2h
      if (diffMin <= 24 * 60 && diffMin > 120 && a.reminder_24h_status === "pending") {
        if (!businessNow) continue; // wait for business hours
        if (!device || device.status !== "connected") continue;

        const dia = formatBR(a.start_time, { weekday: "long", day: "2-digit", month: "2-digit" });
        const hora = formatBR(a.start_time, { hour: "2-digit", minute: "2-digit" });
        const nome = a.contact_name ? a.contact_name.split(" ")[0] : "tudo bem";
        const text = `Oi ${nome}! Passando para lembrar do seu atendimento ${dia} às ${hora}${a.clinic_name ? " na " + a.clinic_name : ""}. Está confirmado? 😊`;
        await sendReminder(supabase, a, device, text);
        await supabase.from("appointments").update({
          reminder_24h_status: "sent", reminder_24h_sent_at: now.toISOString(),
        }).eq("id", a.id);
        sent++;
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, skipped, processed: appts?.length || 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("appointment-reminders-cron error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function sendReminder(supabase: any, appt: any, device: any, text: string) {
  let evoUrl = (device.evolution_api_url || "").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(evoUrl)) evoUrl = `https://${evoUrl}`;

  if (appt.conversation_id) {
    await supabase.from("messages").insert({
      conversation_id: appt.conversation_id,
      role: "assistant",
      content: text,
    });
  }

  await fetch(`${evoUrl}/message/sendText/${device.instance_name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: device.evolution_api_key || "" },
    body: JSON.stringify({ number: appt.contact_number, text }),
  });
}
