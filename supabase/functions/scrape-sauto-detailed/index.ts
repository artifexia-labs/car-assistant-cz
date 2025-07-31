// /supabase/functions/scrape-sauto-detailed/index.ts
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

function buildSautoUrl(model, filters, offset) {
    const params = new URLSearchParams({
        limit: "100",
        offset: offset.toString(),
        manufacturer_model_seo: `${model.make}:${model.model}`,
        category_id: "838",
    });
    if (model.year_from) params.set("year_from", model.year_from.toString());
    if (filters.price_to) params.set("price_to", filters.price_to.toString());
    if (filters.tachometer_to) params.set("tachometer_to", filters.tachometer_to.toString());
    if (filters.fuel) params.set("fuel", filters.fuel);
    if (filters.gearbox) params.set("gearbox", filters.gearbox);
    params.set("condition_seo", filters.condition_seo || "ojete,predvadeci");
    params.set("sort", "1");
    return `https://www.sauto.cz/api/v1/items/search?${params.toString()}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') { return new Response('ok', { headers: corsHeaders }); }

  try {
    const { models: carModels, filters } = await req.json();
    if (!carModels || !filters) {
      throw new Error("Tělo požadavku musí obsahovat 'models' a 'filters'.");
    }
    
    // Krok 1: Získání Cookies
    const handshakeResponse = await fetch('https://www.sauto.cz', { headers: BROWSER_HEADERS });
    const cookiesRaw = handshakeResponse.headers.get("set-cookie")?.split(', ');
    const cookies = cookiesRaw?.map(c => c.split(';')[0]).join('; ') || '';
    if (!cookies) throw new Error('Nepodařilo se získat session cookies.');
    const headersWithCookie = { ...BROWSER_HEADERS, 'Cookie': cookies };

    // Krok 2: Rychlé vyhledávání
    console.log(`[SCRAPER] Spouštím rychlé vyhledávání pro ${carModels.length} modelů...`);
    let summaryAds = [];
    for (const model of carModels) {
        let hasMorePages = true;
        let offset = 0;
        while (hasMorePages) {
          const searchUrl = buildSautoUrl(model, filters, offset);
          const apiResponse = await fetch(searchUrl, { headers: headersWithCookie });
          if (!apiResponse.ok) {
            console.error(`[SCRAPER] Chyba API vyhledávání pro ${model.model}. Status: ${apiResponse.status}`);
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
          // Omezení na 1000 inzerátů na model
          if (offset >= 1000) {
              hasMorePages = false;
          }
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

    const uniqueAds = Array.from(new Map(summaryAds.map(ad => [ad.id, ad])).values());
    uniqueAds.sort((a, b) => new Date(b.sorting_date).getTime() - new Date(a.sorting_date).getTime());
    // --- 🔥 ZMĚNA: Snížení počtu nejlepších inzerátů z 20 na 15 🔥 ---
    const top15Ads = uniqueAds.slice(0, 15);

    if (top15Ads.length === 0) {
        return new Response(JSON.stringify([]), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
    }

    // Krok 3: Postupné načítání detailů
    console.log(`[SCRAPER] Spouštím detailní sběr pro ${top15Ads.length} nejlepších...`);
    const carListings = [];
    for (const ad of top15Ads) {
      try {
        const detailResponse = await fetch(`https://www.sauto.cz/api/v1/items/${ad.id}`, { headers: headersWithCookie });
        if (detailResponse.ok) {
          const detailData = await detailResponse.json();
          if (detailData.result) {
            carListings.push(detailData.result);
          }
        } else {
          console.error(`[SCRAPER] Chyba při získávání detailů pro inzerát ${ad.id}. Status: ${detailResponse.status}`);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        console.error(`[SCRAPER] Kritická chyba při získávání detailů pro inzerát ${ad.id}:`, e);
      }
    }
    
    console.log(`[SCRAPER] Úspěšně získáno ${carListings.length} detailních inzerátů.`);

    return new Response(JSON.stringify(carListings), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[SCRAPER] Kritická chyba: ", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});