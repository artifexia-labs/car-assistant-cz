// /supabase/functions/call-gemini-appraiser/index.ts
import { serve } from "std/http";
import { GoogleGenerativeAI } from "@google/generative-ai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Инициализация клиента Gemini API
const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!);

serve(async (req) => {
  // Обработка CORS preflight запроса
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Получаем детали автомобиля из тела запроса
    const { adDetails } = await req.json();
    if (!adDetails) {
      throw new Error("V těle požadavku chybí 'adDetails'.");
    }

    // Собираем ключевую информацию для промпта
    const year = adDetails.manufacturing_date ? new Date(adDetails.manufacturing_date).getFullYear() : 'neuvedeno';
    const carInfo = `
      - Titulek: ${adDetails.name}
      - Inzerovaná cena: ${adDetails.price.toLocaleString('cs-CZ')} Kč
      - Rok výroby: ${year}
      - Nájezd: ${adDetails.tachometer} km
      - VIN: ${adDetails.vin || "Neuvedeno"}
      - Palivo: ${adDetails.fuel_cb?.name || "n/a"}
      - Převodovka: ${adDetails.gearbox_cb?.name || "n/a"}
      - Výkon: ${adDetails.engine_power ? `${adDetails.engine_power} kW` : 'n/a'}
      - Popis od prodejce: "${adDetails.description || 'Bez popisu'}"
      - Historie: První majitel: ${adDetails.first_owner ? 'Ano' : 'Ne'}, Havarováno: ${adDetails.crashed_in_past ? 'Ano' : 'Ne'}
      - Výbava: ${(adDetails.equipment_cb && Array.isArray(adDetails.equipment_cb)) ? adDetails.equipment_cb.map((eq) => eq.name).join(', ') : "Není k dispozici"}
    `;

    // Создаем промпт для AI
    const prompt = `
      Jsi expert na oceňování ojetých vozů na českém trhu. Tvým úkolem je analyzovat data z inzerátu a stanovit reálnou tržní cenu.

      Informace o vozidle:
      ${carInfo}

      PRAVIDLA PRO ODPOVĚĎ:
      1.  **Analýza ceny**: Porovnej inzerovanou cenu s aktuální tržní situací pro daný model, rok, nájezd a výbavu.
      2.  **Identifikace faktorů**: Najdi klíčové faktory, které cenu zvyšují (např. nízký nájezd, nadstandardní výbava, jasná historie) a které ji snižují (např. vysoký nájezd, stočený tachometr, nejasný původ, chudá výbava, špatná pověst motorizace).
      3.  **Výstupní formát**: Odpověz POUZE ve formátu JSON. Vytvoř hlavní objekt s následujícími klíči v češtině:
          - "estimated_price_min": Odhadovaná minimální reálná tržní cena (jako číslo).
          - "estimated_price_max": Odhadovaná maximální reálná tržní cena (jako číslo).
          - "analysis_summary_cz": Krátké a výstižné shrnutí tvé analýzy (2-3 věty). Vysvětli, proč si myslíš, že je cena nadhodnocená, podhodnocená nebo adekvátní.
          - "positive_factors_cz": Pole stringů s faktory, které pozitivně ovlivňují cenu.
          - "negative_factors_cz": Pole stringů s faktory, které negativně ovlivňují cenu.
          - "negotiation_tips_cz": Pole stringů s konkrétními tipy pro vyjednávání o ceně na základě nalezených negativních faktorů.

      Příklad odpovědi:
      {
        "estimated_price_min": 380000,
        "estimated_price_max": 410000,
        "analysis_summary_cz": "Inzerovaná cena je mírně nad horní hranicí tržní hodnoty. Důvodem je populární motorizace a nízký nájezd, nicméně základní výbava a absence servisní knihy dávají prostor pro vyjednávání.",
        "positive_factors_cz": ["Nízký nájezd (85 000 km)", "Atraktivní naftový motor", "První majitel v ČR"],
        "negative_factors_cz": ["Základní stupeň výbavy 'Active'", "Chybí servisní kniha", "Několik kosmetických vad v popisu"],
        "negotiation_tips_cz": ["Upozorněte na chybějící servisní knihu a navrhněte slevu 5-10 tisíc Kč.", "Zmiňte náklady na opravu kosmetických vad a požadujte adekvátní snížení ceny."]
      }
    `;

    // Вызываем модель Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { response_mime_type: "application/json" },
    });

    const aiResponse = JSON.parse(result.response.text());

    // Отправляем ответ на фронтенд
    return new Response(JSON.stringify(aiResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error(`[call-gemini-appraiser] Kritická chyba: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});