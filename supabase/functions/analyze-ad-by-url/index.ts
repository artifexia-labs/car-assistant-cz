// /supabase/functions/analyze-ad-by-url/index.ts
import { serve } from "std/http";
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!);

function formatAdForPrompt(ad) {
      const year = ad.manufacturing_date ? new Date(ad.manufacturing_date).getFullYear() : 'neuvedeno';
      return `--- Inzerát ID: ${ad.id} ---
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
- Historie a dokumenty:
  - První majitel: ${ad.first_owner ? 'Ano' : 'Ne'}
  - Země původu: ${ad.country_of_origin_cb?.name || "neuvedeno"}
  - Havarováno v minulosti: ${ad.crashed_in_past ? 'Ano' : 'Ne'}
- Popis od prodejce:
  "${ad.description || 'Bez popisu'}"
- Kompletní výbava (analyzuj pouze názvy):
  ${(ad.equipment_cb && Array.isArray(ad.equipment_cb)) ? ad.equipment_cb.map((eq) => eq.name).join(', ') : "Není k dispozici"}`;
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

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    console.log('[AD_ANALYZER] Volám get-ad-details...');
    const { data: adData, error: adError } = await supabaseClient.functions.invoke(
      'get-ad-details',
      { body: { adUrl } }
    );

    if (adError) throw adError;
    const adDetails = adData.ad_details;

    console.log('[AD_ANALYZER] Data obdržena. Formátuji pro AI...');
    const adInfoForPrompt = formatAdForPrompt(adDetails);

    const prompt = `
      Jsi špičkový AI auto-inspektor. Tvým úkolem je pečlivě zanalyzovat následující inzerát a poskytnout detailní hodnocení pro potenciálního kupce. Zaměř se na logické nesrovnalosti, možná rizika a celkovou atraktivitu nabídky.

      Inzerát k analýze:
      ${adInfoForPrompt}

      Tvá odpověď musí být POUZE ve formátu JSON a obsahovat hlavní objekt s následujícími klíči:
      - "summary_cz": Detailní, ale čtivé shrnutí vozu a tvého celkového dojmu.
      - "pros_cz": Pole stringů s konkrétními plusy a výhodami této nabídky.
      - "cons_cz": Pole stringů s konkrétními riziky, nevýhodami nebo podezřelými body.
      - "questions_for_seller_cz": Pole stringů s 3-4 klíčovými otázkami pro prodejce, které pomohou objasnit nejasnosti.
      - "final_recommendation_cz": Krátké doporučení (např. "Doporučuji opatrnou prohlídku", "Slibná koupě", "Vysoké riziko").
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { response_mime_type: "application/json" },
    });
    
    const aiResponse = JSON.parse(result.response.text());

    let image_urls = [];
    if (adDetails.images && adDetails.images.length > 0) {
        image_urls = adDetails.images.slice(0, 3).map(img => 
            `https:${img.url}?fl=exf|crr,1.33333,0|res,1024,768,1|wrm,/watermark/sauto.png,10,10|jpg,80,,1`
        );
    }

    const finalReport = {
      original_ad: {
        id: adDetails.id,
        title: adDetails.name,
        url: adUrl,
        price: `${adDetails.price.toLocaleString('cs-CZ')} Kč`,
        images: image_urls,
        description: adDetails.description,
      },
      ai_analysis: aiResponse
    };

    console.log("[AD_ANALYZER] Analýza dokončena. Odesílám finální výsledek.");
    return new Response(JSON.stringify(finalReport), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('[AD_ANALYZER] Kritická chyba v procesu:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});