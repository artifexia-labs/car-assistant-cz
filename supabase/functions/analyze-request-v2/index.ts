// /supabase/functions/analyze-request-v2/index.ts
import { serve } from "std/http";
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userQuery } = await req.json();
    if (!userQuery) {
      throw new Error("V těle požadavku chybí 'userQuery'.");
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // --- Шаг 1: Вызываем "Стратега" ---
    console.log('[Orchestrator] Vstupní dotaz:', userQuery);
    console.log('[Orchestrator] Volám Stratéga...');
    const { data: strategistData, error: strategistError } = await supabaseClient.functions.invoke(
      'call-gemini-strategist',
      { body: { userQuery } }
    );
    if (strategistError) throw strategistError;

    // --- Шаг 2: Диагностика и проверка ответа от Стратега ---
    console.log('[Orchestrator] Odpověď od Stratéga obdržena.');

    let parsedData = strategistData;
    if (typeof strategistData === 'string') {
        try {
            parsedData = JSON.parse(strategistData);
        } catch (e) {
            console.error('[Orchestrator] Chyba při parsování odpovědi od Stratéga:', e);
            throw new Error('Stratég vrátil ne-JSON string.');
        }
    }

    const models = parsedData?.models;
    const filters = parsedData?.filters;

    if (!models || !Array.isArray(models) || models.length === 0 || !filters) {
      console.error('[Orchestrator] Kritická chyba: Stratég nevrátil "models" nebo "filters" v očekávaném formátu.', parsedData);
      throw new Error('Stratég nevrátil platné modely nebo filtry.');
    }
    console.log('[Orchestrator] Stratégem vybrané modely a filtry:', { models, filters });
    
    // --- Шаг 3: Вызываем "Сборщика данных" ---
    console.log('[Orchestrator] Volám Sběrače dat (scrape-sauto-detailed)...');
    const { data: carListings, error: scrapeError } = await supabaseClient.functions.invoke(
      'scrape-sauto-detailed',
      { body: { models, filters } }
    );
    if (scrapeError) throw scrapeError;
    if (!carListings || carListings.length === 0) {
        console.log('[Orchestrator] Sběrač dat nenalezl žádné vozy.');
        // В этом случае возвращаем пустой результат, чтобы фронтенд мог это обработать
        return new Response(JSON.stringify({ summary_message: "Podle zadaných kritérií se nepodařilo najít žádné vozy. Zkuste prosím upravit svůj dotaz.", inspected_cars: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    console.log(`[Orchestrator] Sběrač dat nalezl ${carListings.length} vozů. Volám Inspektora...`);
    // --- Шаг 4: Вызываем "Инспектора" ---
    const { data: inspectorResult, error: inspectorError } = await supabaseClient.functions.invoke(
      'call-gemini-inspector',
      { body: { userQuery, carListings } }
    );
    if (inspectorError) throw inspectorError;

    console.log('[Orchestrator] Proces dokončen. Odesílám finální výsledek.');
    return new Response(JSON.stringify(inspectorResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('[Orchestrator] Kritická chyba v procesu:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});