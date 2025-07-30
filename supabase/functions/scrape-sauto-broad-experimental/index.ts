// /supabase/functions/scrape-sauto-broad-experimental/index.ts
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

function buildSautoUrl(filters, offset) {
    const params = new URLSearchParams({
        limit: "100",
        offset: offset.toString(),
        category_id: "838", // Osobní vozy
        sort: "1" // Od nejnovějších
    });

    // Přidání filtrů z objektu
    for (const key in filters) {
        if (filters[key]) {
            params.set(key, filters[key].toString());
        }
    }
    // Výchozí stav, pokud není specifikován
    if (!filters.condition_seo) {
        params.set("condition_seo", "ojete,predvadeci");
    }

    return `https://www.sauto.cz/api/v1/items/search?${params.toString()}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') { return new Response('ok', { headers: corsHeaders }); }

  try {
    const { filters } = await req.json();
    if (!filters) {
      throw new Error("Tělo požadavku musí obsahovat 'filters'.");
    }

    // Krok 1: Získání Cookies
    const handshakeResponse = await fetch('https://www.sauto.cz', { headers: BROWSER_HEADERS });
    const cookiesRaw = handshakeResponse.headers.get("set-cookie")?.split(', ');
    const cookies = cookiesRaw?.map(c => c.split(';')[0]).join('; ') || '';
    if (!cookies) throw new Error('Nepodařilo se získat session cookies.');
    const headersWithCookie = { ...BROWSER_HEADERS, 'Cookie': cookies };

    // Krok 2: Široké vyhledávání podle filtrů
    console.log(`[SCRAPER-BROAD] Spouštím široké vyhledávání...`, filters);
    let summaryAds = [];
    let hasMorePages = true;
    let offset = 0;
    const MAX_ADS_TO_FETCH = 500; // Omezíme počet inzerátů, abychom nezahltili API

    while (hasMorePages && offset < MAX_ADS_TO_FETCH) {
      const searchUrl = buildSautoUrl(filters, offset);
      console.log(`[SCRAPER-BROAD] Dotazuji URL: ${searchUrl}`);
      const apiResponse = await fetch(searchUrl, { headers: headersWithCookie });

      if (!apiResponse.ok) {
        console.error(`[SCRAPER-BROAD] Chyba API vyhledávání. Status: ${apiResponse.status}`);
        hasMorePages = false;
        continue;
      }

      const searchData = await apiResponse.json();
      const listingsFromSearch = searchData.results || [];

      if (listingsFromSearch.length > 0) {
          summaryAds.push(...listingsFromSearch);
          offset += 100;
      } else {
          hasMorePages = false;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Seřadíme unikátní inzeráty a vezmeme top 20
    const uniqueAds = Array.from(new Map(summaryAds.map(ad => [ad.id, ad])).values());
    uniqueAds.sort((a, b) => new Date(b.sorting_date).getTime() - new Date(a.sorting_date).getTime());
    const top20Ads = uniqueAds.slice(0, 20);

    if (top20Ads.length === 0) {
        return new Response(JSON.stringify([]), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
    }

    // Krok 3: Načítání detailů pro top 20
    console.log(`[SCRAPER-BROAD] Spouštím detailní sběr pro ${top20Ads.length} nejlepších...`);
    const carListings = [];
    for (const ad of top20Ads) {
      try {
        const detailResponse = await fetch(`https://www.sauto.cz/api/v1/items/${ad.id}`, { headers: headersWithCookie });
        if (detailResponse.ok) {
          const detailData = await detailResponse.json();
          if (detailData.result) {
            carListings.push(detailData.result);
          }
        } else {
          console.error(`[SCRAPER-BROAD] Chyba při získávání detailů pro inzerát ${ad.id}. Status: ${detailResponse.status}`);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        console.error(`[SCRAPER-BROAD] Kritická chyba při získávání detailů pro inzerát ${ad.id}:`, e);
      }
    }
    
    console.log(`[SCRAPER-BROAD] Úspěšně získáno ${carListings.length} detailních inzerátů.`);

    return new Response(JSON.stringify(carListings), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[SCRAPER-BROAD] Kritická chyba: ", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});