import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

interface Unit {
  id: string;
  brand: string | null;
  name: string;
  city: string | null;
  state: string | null;
  neighborhoods: string[];
  phone: string | null;
  maps_link: string | null;
  schedules_via_ecuro: boolean;
}

const shape = (u: Unit) => ({
  name: u.name,
  brand: u.brand,
  city: u.city,
  state: u.state,
  phone: u.phone,
  maps_link: u.maps_link,
  schedules_via_ecuro: u.schedules_via_ecuro,
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string" || !query.trim()) {
      return new Response(
        JSON.stringify({ status: "not_found", error: "query vazio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("clinic_units")
      .select("id,brand,name,city,state,neighborhoods,phone,maps_link,schedules_via_ecuro");

    if (error) throw error;
    const units = (data || []) as Unit[];

    const q = norm(query);
    const tokens = q.split(" ").filter((t) => t.length >= 3);

    // 1) exact neighborhood match
    let matches = units.filter((u) =>
      (u.neighborhoods || []).some((n) => norm(n) === q)
    );

    // 2) partial neighborhood contains (any token)
    if (matches.length === 0) {
      matches = units.filter((u) =>
        (u.neighborhoods || []).some((n) => {
          const nn = norm(n);
          return nn.includes(q) || tokens.some((t) => nn.includes(t));
        })
      );
    }

    // 3) city or name match
    if (matches.length === 0) {
      matches = units.filter((u) => {
        const city = norm(u.city || "");
        const name = norm(u.name || "");
        if (!city && !name) return false;
        if (city === q || name === q) return true;
        if (city.includes(q) || name.includes(q)) return true;
        return tokens.some((t) => (city && city.includes(t)) || (name && name.includes(t)));
      });
    }

    if (matches.length === 0) {
      return new Response(
        JSON.stringify({ status: "not_found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (matches.length === 1) {
      return new Response(
        JSON.stringify({ status: "single", unit: shape(matches[0]) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ status: "multiple", units: matches.slice(0, 3).map(shape) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("find-nearest-unit error:", e);
    return new Response(
      JSON.stringify({ status: "not_found", error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
