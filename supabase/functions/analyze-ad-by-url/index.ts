// /supabase/functions/analyze-ad-by-url/index.ts
import { serve } from "std/http";
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

// Helper function to format details for the widget
function getVehicleDetailsWidget(ad: any) {
    if (!ad) return {};
    return {
        "Model": ad.name || "N/A",
        "Cena": ad.price ? `${ad.price.toLocaleString('cs-CZ')} Kč` : "N/A",
        "Rok výroby": ad.manufacturing_date ? new Date(ad.manufacturing_date).getFullYear() : 'N/A',
        "Tachometr": ad.tachometer ? `${ad.tachometer.toLocaleString('cs-CZ')} km` : 'N/A',
        "VIN": ad.vin || "Neuvedeno",
        "Palivo": ad.fuel_cb?.name || "N/A",
        "Převodovka": ad.gearbox_cb?.name || "N/A",
        "Výkon": ad.engine_power ? `${ad.engine_power} kW` : 'N/A',
        "Původ": ad.country_of_origin_cb?.name || "N/A",
        "Platnost STK": ad.stk_date ? new Date(ad.stk_date).toLocaleDateString('cs-CZ') : 'Neuvedena'
    };
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

    // Krok 1: Získání detailů inzerátu
    console.log('[Analyzer V2.1] Calling get-ad-details...');
    const { data: adData, error: adError } = await supabaseClient.functions.invoke(
      'get-ad-details', { body: { adUrl } }
    );
    if (adError) throw new Error(`Failed to get ad details: ${adError.message}`);
    const adDetails = adData?.ad_details;
    if (!adDetails) throw new Error("Function 'get-ad-details' returned no data.");


    // Krok 2: Volání komplexního AI analytika
    console.log('[Analyzer V2.1] Calling call-gemini-analyst...');
    const { data: aiAnalysis, error: aiError } = await supabaseClient.functions.invoke(
      'call-gemini-analyst', { body: { adDetails } }
    );
    if (aiError) throw new Error(`AI analysis failed: ${aiError.message}`);
    if (!aiAnalysis) throw new Error("Function 'call-gemini-analyst' returned no data.");
    
    // Krok 3: Sestavení finálního reportu
    const finalReport = {
      vehicle_details_widget: getVehicleDetailsWidget(adDetails),
      ai_analysis: aiAnalysis,
      original_ad: {
          url: adUrl,
          images: adDetails.images?.slice(0, 4).map(img => 
              `https:${img.url}?fl=exf|crr,1.33333,0|res,1024,768,1|wrm,/watermark/sauto.png,10,10|jpg,80,,1`
          ) || []
      }
    };

    console.log("[Analyzer V2.1] Analysis complete. Sending final report.");
    return new Response(JSON.stringify(finalReport), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('[Analyzer V2.1] Critical error in orchestrator:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});