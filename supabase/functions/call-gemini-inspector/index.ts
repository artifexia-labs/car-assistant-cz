// /supabase/functions/call-gemini-inspector/index.ts
import { serve } from "std/http";
import { GoogleGenerativeAI } from "@google/generative-ai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!);

async function getAdDetails(adId: number) {
    const detailApiUrl = `https://www.sauto.cz/api/v1/items/${adId}`;
    try {
        const detailResponse = await fetch(detailApiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!detailResponse.ok) return null;
        const detailData = await detailResponse.json();
        // --- 🔥 Логирование полного ответа от API 🔥 ---
        console.log(`[INSPECTOR] Raw API Response for AD ID ${adId}:`);
        console.log(JSON.stringify(detailData, null, 2));
        return detailData.result;
    } catch (e) {
        console.error(`[INSPECTOR] Chyba při načítání detailu pro ID ${adId}:`, e);
        return null;
    }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') { return new Response('ok', { headers: corsHeaders }); }

  try {
    const { userQuery, carListings } = await req.json();
    if (!userQuery || !carListings) { throw new Error("V požadavku chybí 'userQuery' nebo 'carListings'."); }

    const sortedListings = carListings
      .sort((a, b) => (a.price || Infinity) - (b.price || Infinity))
      .sort((a, b) => (a.tachometer || Infinity) - (b.tachometer || Infinity));

    const topCandidates = sortedListings.slice(0, 20);
    const detailedAds = (await Promise.all(topCandidates.map(ad => getAdDetails(ad.id)))).filter(ad => ad !== null);

    const adsMap = new Map(detailedAds.map(ad => [ad.id, ad]));
    console.log(`[INSPECTOR] Загружены детали для ${detailedAds.length} объявлений.`);

    if (detailedAds.length === 0) {
        return new Response(JSON.stringify({ inspected_cars: [], summary_message: "Bohužel se nepodařilo načíst podrobnosti pro nalezené vozy." }), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
    }

    const adsForPrompt = detailedAds.map((ad) => {
      const year = ad.manufacturing_date ? new Date(ad.manufacturing_date).getFullYear() : 'neuvedeno';
      const sellerType = ad.user?.user_service?.shop_name ? `Prodejce (dealer): ${ad.user.user_service.shop_name}` : "Soukromý prodejce";

      const infoBlock = `--- Inzerát ID: ${ad.id} ---
- Titulek: ${ad.name}
- Cena: ${ad.price.toLocaleString('cs-CZ')} Kč
- Rok výroby: ${year}
- Nájezd: ${ad.tachometer} km
- VIN: ${ad.vin || "Neuvedeno"}
- Prodejce: ${sellerType}
- Popis od prodejce: "${ad.description || 'Bez popisu'}"
- Klíčové parametry: Karosérie: ${ad.vehicle_body_cb?.name || "n/a"}, Palivo: ${ad.fuel_cb?.name || "n/a"}, Převodovka: ${ad.gearbox_cb?.name || "n/a"}, Výkon: ${ad.engine_power ? `${ad.engine_power} kW` : 'n/a'}
- Historie: První majitel: ${ad.first_owner ? 'Ano' : 'Ne'}, Země původu: ${ad.country_of_origin_cb?.name || "n/a"}, Havarováno: ${ad.crashed_in_past ? 'Ano' : 'Ne'}
- Kompletní výbava: ${(ad.equipment_cb && Array.isArray(ad.equipment_cb)) ? ad.equipment_cb.map((eq) => eq.name).join(', ') : "Není k dispozici"}
      `;
      return infoBlock;
    }).join('\n\n');

    const prompt = `
      Jsi špičkový AI auto-expert a poradce pro nákup ojetin. Tvým úkolem je seřadit následující inzeráty od NEJLEPŠÍ nabídky po nejhorší a pro 3 nejlepší vytvořit detailní, přesvědčivou a upřímnou analýzu.

      Požadavek uživatele: "${userQuery}"

      PRAVIDLA PRO ODPOVĚĎ:
      1.  **Seřazení výsledků**: V JSON odpovědi musí být pole "inspected_cars" seřazeno od nejlepšího po nejhorší nabídku na základě tvého expertního posouzení (cena, stav, nájezd, historie, poptávka uživatele).
      2.  **Detailní souhrn (summary_cz)**: Napiš alespoň 2-3 věty. Začni celkovým dojmem a zdůrazni nejdůležitější aspekt vozu.
      3.  **Argumentace (pros_cz, cons_cz)**: Ke každému bodu přidej krátké vysvětlení a konkrétní údaj z inzerátu v závorce.
      4.  **Rozšířený verdikt (final_verdict_cz)**: Toto je nejdůležitější část! Napiš detailní odstavec (3-5 vět). Jasně řekni, zda se koupě vyplatí. Pro koho je auto vhodné? Na jaké počáteční investice se má kupující připravit? Jaké jsou dlouhodobé vyhlídky? Buď upřímný a přímý.
      5.  **Kontrola VIN**: Pokud VIN v inzerátu končí na "XXXXXX" nebo chybí, přidej do "questions_for_seller_cz" otázku na kompletní VIN.

      Seznam inzerátů k analýze:
      ${adsForPrompt}

      Tvá odpověď musí být POUZE ve formátu JSON. Vytvoř hlavní objekt se dvěma klíči:
      1. "summary_message": Krátká souhrnná zpráva pro uživatele v češtině.
      2. "inspected_cars": SEŘAZENÉ pole 3 nejlepších objektů s TVOU ANALÝZOU:
         - "id": ID inzerátu (číslo)
         - "summary_cz": Detailní, čtivé shrnutí (2-3 věty).
         - "pros_cz": Pole stringů s argumentovanými plusy.
         - "cons_cz": Pole stringů s argumentovanými riziky.
         - "questions_for_seller_cz": Pole stringů s klíčovými otázkami pro prodejce.
         - "final_verdict_cz": Detailní odstavec s finálním doporučením a očekáváním.
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { response_mime_type: "application/json" },
    });

    const aiResponse = JSON.parse(result.response.text());

    const finalInspectedCars = aiResponse.inspected_cars.map(aiCar => {
        const originalAd = adsMap.get(aiCar.id);
        if (!originalAd) return null;

        let image_urls = [];
        if (originalAd.images && originalAd.images.length > 0) {
            image_urls = originalAd.images.slice(0, 3).map(img =>
                `https:${img.url}?fl=exf|crr,1.33333,0|res,1024,768,1|wrm,/watermark/sauto.png,10,10|jpg,80,,1`
            );
        }

        return {
            id: originalAd.id,
            title: originalAd.name,
            url: `https://www.sauto.cz/osobni/detail/${originalAd.manufacturer_cb.seo_name}/${originalAd.model_cb.seo_name}/${originalAd.id}`,
            price: `${originalAd.price.toLocaleString('cs-CZ')} Kč`,
            images: image_urls,
            vin: originalAd.vin || null,
            seller_info: { // --- 🔥 Расширенная информация о продавце 🔥 ---
                name: originalAd.seller_info?.seller_name || originalAd.user?.user_service?.shop_name || null,
                location: originalAd.seller_info?.location?.title || null,
                phone: originalAd.phone || originalAd.seller_info?.seller_phones?.[0] || null,
                shop_name: originalAd.user?.user_service?.shop_name || null,
                shop_url: originalAd.user?.user_service?.shop_url || null
            },
            summary_cz: aiCar.summary_cz,
            pros_cz: aiCar.pros_cz,
            cons_cz: aiCar.cons_cz,
            questions_for_seller_cz: aiCar.questions_for_seller_cz,
            final_verdict_cz: aiCar.final_verdict_cz // --- 🔥 Расширенный вердикт 🔥 ---
        };
    }).filter(car => car !== null);

    const finalReport = {
        summary_message: aiResponse.summary_message,
        inspected_cars: finalInspectedCars, // --- 🔥 Результаты уже отсортированы AI 🔥 ---
    };

    console.log("[INSPECTOR] Финальный отчет собран. Отправка на фронтенд.");
    return new Response(JSON.stringify(finalReport), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });

  } catch (error) {
    console.error(`[INSPECTOR] Критическая ошибка: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});