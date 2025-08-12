// /supabase/functions/call-gemini-inspector/index.ts
import { serve } from "std/http";
import { GoogleGenerativeAI } from "@google/generative-ai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!);

// Helper funkce pro získání detailů zůstává, je stále užitečná
async function getAdDetails(adId: number) {
    const detailApiUrl = `https://www.sauto.cz/api/v1/items/${adId}`;
    try {
        const detailResponse = await fetch(detailApiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!detailResponse.ok) return null;
        const detailData = await detailResponse.json();
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

    // --- 🔥 ZMĚNA: Snížení počtu kandidátů z 20 na 15 🔥 ---
    const topCandidates = carListings.slice(0, 15);

    // Načtení detailů (pokud by carListings neobsahovaly všechny detaily)
    // Tento krok je spíše pojistka, protože scrape-sauto-detailed by již měl vracet plné detaily
    const detailedAds = (await Promise.all(topCandidates.map(ad => getAdDetails(ad.id)))).filter(ad => ad !== null);
    
    const adsMap = new Map(detailedAds.map(ad => [ad.id, ad]));
    console.log(`[INSPECTOR] Připraveno ${detailedAds.length} detailních inzerátů k analýze.`);

    if (detailedAds.length === 0) {
        return new Response(JSON.stringify({ inspected_cars: [], summary_message: "Bohužel se nepodařilo načíst podrobnosti pro nalezené vozy." }), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
    }

    // --- 🔥 ZMĚNA: Nový, striktnější prompt, který posílá kompletní JSON data 🔥 ---
    const prompt = `
      Jsi špičkový AI auto-expert a poradce pro nákup ojetin. Tvým úkolem je analyzovat následující JSON data s inzeráty, seřadit je od NEJLEPŠÍ nabídky po nejhorší a pro 3 nejlepší vytvořit detailní, přesvědčivou a upřímnou analýzu. DŮSLEDNĚ se řiď požadavkem uživatele.

      Požadavek uživatele: "${userQuery}"

      DŮLEŽITÁ PRAVIDLA PRO ANALÝZU A ODPOVĚĎ:
      1.  **ZDROJ DAT**: Tvůj jediný zdroj informací je poskytnutý JSON. Důkladně analyzuj VŠECHNY dostupné klíče a hodnoty pro každý inzerát. Věnuj zvláštní pozornost detailům jako je barva (hledej v objektu \`color_cb\`), výbava (\`equipment_cb\`), stav (\`condition_cb\`), původ (\`country_of_origin_cb\`) a specifikace motoru.
      2.  **SEŘAZENÍ**: V JSON odpovědi musí být pole "inspected_cars" seřazeno od nejlepšího po nejhorší nabídku na základě TVÉHO expertního posouzení, které striktně zohledňuje požadavek uživatele a celkovou výhodnost nabídky (cena, stav, nájezd, historie, výbava).
      3.  **DETAILNÍ SOUHRN (summary_cz)**: Napiš alespoň 2-3 věty. Začni celkovým dojmem a zdůrazni nejdůležitější aspekt vozu ve vztahu k dotazu uživatele.
      4.  **ARGUMENTACE (pros_cz, cons_cz)**: Ke každému bodu přidej krátké vysvětlení a konkrétní údaj z JSONu v závorce. Buď konkrétní.
      5.  **ROZŠÍŘENÝ VERDIKT (final_verdict_cz)**: Toto je nejdůležitější část! Napiš detailní odstavec (3-5 vět). Jasně řekni, zda se koupě vyplatí. Pro koho je auto vhodné? Na jaké počáteční investice se má kupující připravit? Jaké jsou dlouhodobé vyhlídky? Buď upřímný, přímý a kritický.
      6.  **KONTROLA VIN**: Pokud VIN v inzerátu chybí, je neúplný, nebo končí na "XXXXXX", PŘIDEJ do "questions_for_seller_cz" otázku na kompletní VIN pro online prověření historie.

      JSON data s inzeráty k analýze:
      ${JSON.stringify(detailedAds, null, 2)}

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

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" }); // Používáme nejnovější model
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { response_mime_type: "application/json" },
    });

    const aiResponse = JSON.parse(result.response.text());

    // Sestavení finální odpovědi pro frontend
    const finalInspectedCars = aiResponse.inspected_cars.map(aiCar => {
        const originalAd = adsMap.get(aiCar.id);
        if (!originalAd) return null;

        let image_urls = [];
        if (originalAd.images && originalAd.images.length > 0) {
            image_urls = originalAd.images.slice(0, 8).map(img =>
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
            seller_info: {
                name: originalAd.seller_info?.seller_name || originalAd.user?.user_service?.shop_name || "Soukromý prodejce",
                location: originalAd.seller_info?.location?.title || null,
                phone: originalAd.phone || originalAd.seller_info?.seller_phones?.[0] || null,
                shop_name: originalAd.user?.user_service?.shop_name || null,
                shop_url: originalAd.user?.user_service?.shop_url || null
            },
            ...aiCar // Přidání analýzy od AI
        };
    }).filter(car => car !== null);

    const finalReport = {
        summary_message: aiResponse.summary_message,
        inspected_cars: finalInspectedCars,
    };

    console.log("[INSPECTOR] Finální report sestaven. Odesílám na frontend.");
    return new Response(JSON.stringify(finalReport), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });

  } catch (error) {
    console.error(`[INSPECTOR] Kritická chyba: ${error.message}\n${error.stack}`);
    return new Response(JSON.stringify({ error: `Kritická chyba v inspektoru: ${error.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});