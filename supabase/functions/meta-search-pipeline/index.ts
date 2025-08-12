// /supabase/functions/meta-search-pipeline/index.ts
import { serve } from "std/http";
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { GoogleGenerativeAI } from "@google/generative-ai";

// --- Инициализация AI модели для финального ранжирования ---
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
if (!GEMINI_API_KEY) console.error("FATAL: GEMINI_API_KEY is not set.");
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const finalRankerModel = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash", 
    generationConfig: { responseMimeType: "application/json" }
});


// --- Вспомогательная функция для нормализации данных (ИСПРАВЛЕНА) ---
function normalizeCarData(car, platform) {
    if (platform === 'sauto') {
        const analysis = car.ai_analysis || {};
        const detailsWidget = car.vehicle_details_widget || {};
        return {
            platform: 'Sauto.cz',
            title: car.title || detailsWidget.Model || 'N/A',
            url: car.url,
            price: car.price || detailsWidget.Cena || 'N/A',
            images: car.images || [],
            verdict: analysis.final_verdict_cz || 'Verdikt není k dispozici.',
            pros: analysis.pros_cz || [],
            cons: analysis.cons_cz || [],
            details: Object.entries(detailsWidget)
        };
    }
    if (platform === 'bazos') {
        const analysisData = car.analysis || {};
        const summary = analysisData.vehicle_summary || {};
        const innerAnalysis = analysisData.analysis || {};
        return {
            platform: 'Bazos.cz',
            title: car.title,
            url: car.url,
            price: car.price,
            images: car.imageUrls || [],
            verdict: summary.general_model_info || 'Verdikt není k dispozici.',
            pros: innerAnalysis.pros || [],
            cons: innerAnalysis.cons || [],
            details: Object.entries(summary.details || {})
        };
    }
    return car; // Fallback
}


// --- Главная функция-оркестратор ---
serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { userQuery, platforms } = await req.json();
        if (!userQuery || !Array.isArray(platforms) || platforms.length === 0) {
            throw new Error("Požadavek musí obsahovat 'userQuery' a pole 'platforms'.");
        }
        console.log(`[META-PIPELINE] Spuštěno pro dotaz: "${userQuery}" na platformách: ${platforms.join(', ')}`);

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        );

        const platformPipelines = {
            'sauto': 'analyze-request-v2', // Pro Sauto použijeme jako výchozí spolehlivý Focus-v2
            'bazos': 'master-pipeline',
        };

        const searchPromises = platforms
            .filter(platform => platformPipelines[platform])
            .map(platform => {
                const functionName = platformPipelines[platform];
                const body = { query: userQuery, userQuery: userQuery }; // posíláme oba, ať si pipeline vybere
                console.log(`[META-PIPELINE] Spouštím pipeline '${functionName}' pro ${platform}...`);
                return supabaseClient.functions.invoke(functionName, { body });
            });

        const results = await Promise.allSettled(searchPromises);
        console.log(`[META-PIPELINE] Všechny pipeliny dokončeny.`);

        let combinedAds = [];
        results.forEach((result, index) => {
            const platform = platforms[index];
            if (result.status === 'fulfilled' && !result.value.error) {
                const data = result.value.data;
                const cars = data.inspected_cars || data; 
                
                if (Array.isArray(cars)) {
                    const normalizedCars = cars.map(car => normalizeCarData(car, platform));
                    combinedAds.push(...normalizedCars);
                    console.log(`[META-PIPELINE] Získáno ${normalizedCars.length} vozů z ${platform}.`);
                }
            } else {
                console.error(`[META-PIPELINE] Pipeline pro ${platform} selhal:`, result.reason || result.value.error);
            }
        });
        
        if (combinedAds.length === 0) {
            return new Response(JSON.stringify({ summary_message: "Bohužel se nepodařilo najít žádné relevantní vozy.", inspected_cars: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        console.log(`[META-PIPELINE] Odesílám ${combinedAds.length} vozů do finálního AI rankeru...`);
        const rankerPrompt = `
            You are a chief car expert. The user's original query was: "${userQuery}".
            Here is a list of the best cars found on different portals: ${JSON.stringify(combinedAds, null, 2)}
            
            Your task: Sort this list from the absolute best match (rank 1) to the worst, based on relevance to the user's query, overall value, and condition.
            
            Return ONLY a valid JSON array of the sorted car objects. Preserve the original structure and all keys of the objects.
        `;

        const rankerResult = await finalRankerModel.generateContent(rankerPrompt);
        const finalRankedList = JSON.parse(rankerResult.response.text());

        console.log(`[META-PIPELINE] Finální seřazení dokončeno. Odesílám výsledek.`);
        return new Response(JSON.stringify({
             summary_message: `Prohledal jsem portály: ${platforms.join(', ')}. Zde je celkové pořadí nejlepších nalezených vozů.`,
             inspected_cars: finalRankedList 
            }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error('[META-PIPELINE] Kritická chyba v procesu:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});