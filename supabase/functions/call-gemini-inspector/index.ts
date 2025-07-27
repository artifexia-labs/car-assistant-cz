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
        return detailData.result; // Возвращаем полный объект 'result'
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
      
      const infoBlock = `--- Inzerát ID: ${ad.id} ---
- Titulek: ${ad.name}
- Cena: ${ad.price.toLocaleString('cs-CZ')} Kč
- Rok výroby: ${year}
- V provozu od: ${ad.in_operation_date ? new Date(ad.in_operation_date).toLocaleDateString('cs-CZ') : 'neuvedeno'}
- Nájezd: ${ad.tachometer} km
- STK platná do: ${ad.stk_date ? new Date(ad.stk_date).toLocaleDateString('cs-CZ') : 'neuvedeno'}

- Specifikace vozu:
  - Karosérie: ${ad.vehicle_body_cb?.name || "neuvedeno"}
  - Palivo: ${ad.fuel_cb?.name || "neuvedeno"}
  - Převodovka: ${ad.gearbox_cb?.name || "neuvedeno"} (${ad.gearbox_levels_cb?.name || ''})
  - Výkon: ${ad.engine_power ? `${ad.engine_power} kW` : 'neuvedeno'}
  - Objem motoru: ${ad.engine_volume ? `${ad.engine_volume} ccm` : 'neuvedeno'}
  - Pohon: ${ad.drive_cb?.name || "neuvedeno"}
  - Barva: ${ad.color_cb?.name || "neuvedeno"}
  - Počet dveří: ${ad.doors || "neuvedeno"}
  - Počet míst: ${ad.capacity || "neuvedeno"}
  - Klimatizace: ${ad.aircondition_cb?.name || "neuvedeno"}

- Historie a dokumenty:
  - První majitel: ${ad.first_owner ? 'Ano' : 'Ne'}
  - Země původu: ${ad.country_of_origin_cb?.name || "neuvedeno"}
  - Havarováno v minulosti: ${ad.crashed_in_past ? 'Ano' : 'Ne'}
  - Norma EURO: ${ad.euro_level_cb?.name || "neuvedeno"}
  
- Popis od prodejce:
  "${ad.description || 'Bez popisu'}"

- Kompletní výbava (analyzuj pouze názvy, ignoruj 'value'):
  ${(ad.equipment_cb && Array.isArray(ad.equipment_cb)) ? ad.equipment_cb.map((eq) => eq.name).join(', ') : "Není k dispozici"}
      `;
      return infoBlock;
    }).join('\n\n');
    
    const prompt = `
      Jsi špičkový AI auto-inspektor. Tvým úkolem je pečlivě analyzovat následující seznam inzerátů na základě požadavku uživatele a vybrat 3 nejlepší. Při analýze výbavy (klíč "Kompletní výbava") se zaměř POUZE na názvy položek, zcela ignoruj jakékoliv 'value' nebo číselné hodnoty u nich. NEZADÁVEJ otázky na informace, které jsou již v parametrech uvedeny (např. pokud je uvedeno "Klimatizace: Dvouzónová automatická", neptej se na to).

      Požadavek uživatele: "${userQuery}"
      Pravidla analýzy: Pracujte důsledně: Analyzujte vozidla striktně jedno po druhém. Hledejte nesrovnalosti: Porovnávejte informace z různých polí. Pokud je v „popisu“ uveden servis při počtu najetých kilometrů, který neodpovídá poli „tachometr“, označ to jako riziko. Nevymýšlejte si: Vyvozujte závěry pouze na základě poskytnutých údajů.
      
      Seznam inzerátů k analýze:
      ${adsForPrompt}

      Tvá odpověď musí být POUZE ve formátu JSON. Vytvoř hlavní objekt se dvěma klíči:
      1. "summary_message": Krátká souhrnná zpráva pro uživatele v češtině.
      2. "inspected_cars": Pole objektů, kde každý objekt obsahuje POUZE ID a VÝSLEDKY TVÉ ANALÝZY:
         - "id": ID inzerátu (číslo)
         - "summary_cz": Stručné a výstižné shrnutí v češtině.
         - "pros_cz": Pole stringů s konkrétními plusy.
         - "cons_cz": Pole stringů s riziky nebo mínusy.
         - "questions_for_seller_cz": Pole stringů s 2-3 klíčovými otázkami pro prodejce na informace, které NEJSOU v popisu.
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

        // Zpracování obrázků
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
            images: image_urls, // Nové pole s obrázky
            summary_cz: aiCar.summary_cz,
            pros_cz: aiCar.pros_cz,
            cons_cz: aiCar.cons_cz,
            questions_for_seller_cz: aiCar.questions_for_seller_cz,
        };
    }).filter(car => car !== null);

    const finalReport = {
        summary_message: aiResponse.summary_message,
        inspected_cars: finalInspectedCars,
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