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
    
    // Шаг 1: Получаем Cookies
    const handshakeResponse = await fetch('https://www.sauto.cz', { headers: BROWSER_HEADERS });
    const cookiesRaw = handshakeResponse.headers.get("set-cookie")?.split(', ');
    const cookies = cookiesRaw?.map(c => c.split(';')[0]).join('; ') || '';
    if (!cookies) throw new Error('Не удалось получить сессионные куки.');
    const headersWithCookie = { ...BROWSER_HEADERS, 'Cookie': cookies };

    // Шаг 2: Быстрый поиск
    console.log(`[SCRAPER] Запускаю быстрый поиск для ${carModels.length} моделей...`);
    let summaryAds = [];
    for (const model of carModels) {
        let hasMorePages = true;
        let offset = 0;
        while (hasMorePages) {
          const searchUrl = buildSautoUrl(model, filters, offset);
          const apiResponse = await fetch(searchUrl, { headers: headersWithCookie });
          if (!apiResponse.ok) {
            console.error(`[SCRAPER] Ошибка API поиска для ${model.model}. Status: ${apiResponse.status}`);
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
          if (offset >= 1000) {
              hasMorePages = false;
          }
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

    const uniqueAds = Array.from(new Map(summaryAds.map(ad => [ad.id, ad])).values());
    uniqueAds.sort((a, b) => new Date(b.sorting_date).getTime() - new Date(a.sorting_date).getTime());
    const top50Ads = uniqueAds.slice(0, 50);

    if (top50Ads.length === 0) {
        return new Response(JSON.stringify([]), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
    }

    // Шаг 3: Детальный сбор для 50 лучших
    console.log(`[SCRAPER] Начинаю детальный сбор для ${top50Ads.length} лучших...`);
    const detailPromises = top50Ads.map(ad =>
      fetch(`https://www.sauto.cz/api/v1/items/${ad.id}`, { headers: headersWithCookie })
        .then(res => res.ok ? res.json() : null)
        .then(data => data?.result || null)
    );
    const carListings = (await Promise.all(detailPromises)).filter(Boolean);

    // --- 🔥 НОВЫЙ ЛОГ ДЛЯ ДИАГНОСТИКИ 🔥 ---
    console.log('--- [DIAGNOSTIC LOG] НАЧАЛО ПОЛНОГО JSON ПЕРВОГО ОБЪЯВЛЕНИЯ ---');
    if (carListings && carListings.length > 0) {
      // Выводим в лог самый первый детальный объект, который мы получили
      console.log(JSON.stringify(carListings[0], null, 2));
    } else {
      console.log('[DIAGNOSTIC LOG] Детальные объявления не найдены.');
    }
    console.log('--- [DIAGNOSTIC LOG] КОНЕЦ ПОЛНОГО JSON ---');
    // --- КОНЕЦ ЛОГА ---

    console.log(`[SCRAPER] Успешно получено ${carListings.length} детальных объявлений.`);

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