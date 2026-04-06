import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");
    if (!APIFY_TOKEN) {
      return new Response(JSON.stringify({ error: "APIFY_API_TOKEN not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { searchQuery, city, maxResults } = await req.json();

    if (!searchQuery || !city) {
      return new Response(JSON.stringify({ error: "searchQuery and city are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const limit = Math.min(maxResults || 50, 200);

    const input = {
      searchStringsArray: [`${searchQuery} em ${city}`],
      locationQuery: city,
      maxCrawledPlacesPerSearch: limit,
      language: "pt-BR",
      deeperCityScrape: false,
      skipClosedPlaces: true,
    };

    console.log("Starting Apify actor with input:", JSON.stringify(input));

    const res = await fetch(
      `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Apify error:", res.status, errText);
      return new Response(JSON.stringify({ error: `Apify API error: ${res.status}`, details: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawResults = await res.json();

    // Extract only phone + name, filter out entries without phone
    const contacts = (rawResults || [])
      .filter((r: any) => r.phone)
      .map((r: any) => ({
        name: r.title || r.name || "",
        phone: r.phone,
        address: r.address || r.street || "",
        category: r.categoryName || "",
      }));

    console.log(`Apify returned ${rawResults?.length || 0} results, ${contacts.length} with phone`);

    return new Response(JSON.stringify({ ok: true, contacts, totalRaw: rawResults?.length || 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Apify Google Maps error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
