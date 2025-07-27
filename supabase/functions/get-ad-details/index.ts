// /supabase/functions/get-ad-details/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://www.sauto.cz/',
};

function getAdIdFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const parts = path.split('/');
    const adId = parts.pop() || parts.pop();
    if (!/^\d+$/.test(adId)) {
      throw new Error("ID inzerátu nebylo v URL nalezeno.");
    }
    return adId;
  } catch (e) {
    throw new Error("Neplatný formát URL.");
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { adUrl } = await req.json();
    if (!adUrl) {
      throw new Error("V těle požadavku chybí 'adUrl'.");
    }

    const adId = getAdIdFromUrl(adUrl);

    const detailApiUrl = `https://www.sauto.cz/api/v1/items/${adId}`;
    const detailResponse = await fetch(detailApiUrl, { headers: BROWSER_HEADERS });

    if (!detailResponse.ok) {
      const errorBody = await detailResponse.text();
      throw new Error(`Chyba při získávání detailů inzerátu. Status: ${detailResponse.status}. Tělo odpovědi: ${errorBody}`);
    }

    const adData = await detailResponse.json();

    if (!adData.result) {
        throw new Error("API Sauto vrátilo odpověď bez klíče 'result'.");
    }

    return new Response(
      JSON.stringify({ ad_details: adData.result }), // Vkládáme výsledek do klíče ad_details
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[GET-AD-DETAILS] Kritická chyba: ", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});