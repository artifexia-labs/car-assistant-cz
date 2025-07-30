// /supabase/functions/analyze-request-v3-experimental/index.ts
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

    // --- Krok 1: Volání nového "Filter Extractora" ---
    console.log('[Orchestrator-V3] Vstupní dotaz:', userQuery);
    console.log('[Orchestrator-V3] Volám Filter Extractor...');
    const { data: extractorData, error: extractorError } = await supabaseClient.functions.invoke(
      'call-gemini-filter-extractor',
      { body: { userQuery } }
    );
    if (extractorError) throw extractorError;

    const filters = extractorData?.filters;
    if (!filters) {
      console.error('[Orchestrator-V3] Kritická chyba: Filter Extractor nevrátil "filters".', extractorData);
      throw new Error('Filter Extractor nevrátil platné filtry.');
    }
    console.log('[Orchestrator-V3] Extrahované filtry:', { filters });
    
    // --- Krok 2: Volání nového "Broad Scrapera" ---
    console.log('[Orchestrator-V3] Volám Sběrače dat (scrape-sauto-broad-experimental)...');
    const { data: carListings, error: scrapeError } = await supabaseClient.functions.invoke(
      'scrape-sauto-broad-experimental',
      { body: { filters } } // Pouze filtry, bez modelů
    );
    if (scrapeError) throw scrapeError;
    if (!carListings || carListings.length === 0) {
        console.log('[Orchestrator-V3] Sběrač dat nenalezl žádné vozy.');
        return new Response(JSON.stringify({ summary_message: "Podle zadaných kritérií se nepodařilo najít žádné vozy. Zkuste prosím upravit svůj dotaz.", inspected_cars: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    console.log(`[Orchestrator-V3] Sběrač dat nalezl ${carListings.length} vozů. Volám Inspektora...`);
    
    // --- Krok 3: Volání stávajícího "Inspektora" ---
    const { data: inspectorResult, error: inspectorError } = await supabaseClient.functions.invoke(
      'call-gemini-inspector', // Používáme stávajícího inspektora
      { body: { userQuery, carListings } }
    );
    if (inspectorError) throw inspectorError;

    console.log('[Orchestrator-V3] Proces dokončen. Odesílám finální výsledek.');
    return new Response(JSON.stringify(inspectorResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('[Orchestrator-V3] Kritická chyba v procesu:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});