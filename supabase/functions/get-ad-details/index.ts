// /supabase/functions/get-ad-details/index.ts
import { serve } from "std/http";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://www.sauto.cz/',
};

function extractAdId(url) {
    const match = url.match(/\/detail\/[^/]+\/[^/]+\/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
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

    const adId = extractAdId(adUrl);
    if (!adId) {
        throw new Error("Nepodařilo se extrahovat ID inzerátu z URL.");
    }

    // Krok 1: Získání Cookies
    const handshakeResponse = await fetch('https://www.sauto.cz', { headers: BROWSER_HEADERS });
    const cookiesRaw = handshakeResponse.headers.get("set-cookie")?.split(', ');
    const cookies = cookiesRaw?.map(c => c.split(';')[0]).join('; ') || '';
    if (!cookies) throw new Error('Nepodařilo se získat session cookies.');
    const headersWithCookie = { ...BROWSER_HEADERS, 'Cookie': cookies };

    // Krok 2: Získání detailů inzerátu
    const detailApiUrl = `https://www.sauto.cz/api/v1/items/${adId}`;
    const detailResponse = await fetch(detailApiUrl, { headers: headersWithCookie });

    if (!detailResponse.ok) {
        throw new Error(`Chyba při načítání detailů inzerátu. Status: ${detailResponse.status}`);
    }

    const detailData = await detailResponse.json();

    if (!detailData.result) {
        throw new Error("Odpověď z API Sauto neobsahuje platná data ('result' je prázdný).");
    }

    return new Response(JSON.stringify({ ad_details: detailData.result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[GET-AD-DETAILS] Kritická chyba: ", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});