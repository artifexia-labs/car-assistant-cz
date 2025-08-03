// supabase/functions/get-top3-analysis/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { DOMParser } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "https://esm.sh/@google/generative-ai";

console.log('✅ "master-pipeline" FINAL version initialized');

// --- NASTAVENÍ ---
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
if (!GEMINI_API_KEY) console.error("FATAL: GEMINI_API_KEY is not set.");
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
    safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ]
});


// --- POMOCNÉ FUNKCE ---
async function scrapeAllSummaries(modelName: string) {
    const searchParams = new URLSearchParams({ 'hledat': modelName, 'rubriky': 'auto' });
    const searchUrl = `https://auto.bazos.cz/?${searchParams.toString()}`;
    
    let allAds: any[] = [];
    let currentPageUrl: string | null = searchUrl;
    let pagesScraped = 0;
    const maxPages = 10;

    while (currentPageUrl && pagesScraped < maxPages) {
        const response = await fetch(currentPageUrl);
        if (!response.ok) break;
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (!doc) break;

        doc.querySelectorAll('.inzeraty.inzeratyflex').forEach(el => {
            const titleElement = el.querySelector('h2.nadpis a');
            const href = titleElement?.getAttribute('href');
            if (href) {
                allAds.push({
                    url: new URL(href, searchUrl).href,
                    title: titleElement?.textContent.trim() || 'N/A',
                });
            }
        });
        const nextLink = Array.from(doc.querySelectorAll('.strankovani a')).find(a => a.textContent.trim().includes('Další'));
        currentPageUrl = nextLink ? new URL(nextLink.getAttribute('href')!, searchUrl).href : null;
        pagesScraped++;
    }
    return allAds.filter(ad => ad.title !== 'N/A' && !ad.title.toLowerCase().includes("sada") && !ad.title.toLowerCase().includes("dily"));
}

async function fetchAdDetails(adUrl: string) {
    const response = await fetch(adUrl);
    if (!response.ok) return null;
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc) return null;

    const description = doc.querySelector('div.popisdetail')?.textContent.trim() || 'N/A';
    const structuredData: Record<string, string> = {};
    description.split('\n').forEach(line => {
        const parts = line.split(':');
        if (parts.length > 1) {
            const key = parts[0].trim().toLowerCase().replace(/\s+/g, '_');
            structuredData[key] = parts.slice(1).join(':').trim();
        }
    });

    const imageUrls = Array.from(doc.querySelectorAll('.carousel-cell img'))
        .map(img => img.getAttribute('data-flickity-lazyload') || img.getAttribute('src'))
        .filter(src => src) as string[];

    // --- VYLEPŠENÉ ZÍSKÁVÁNÍ CENY ---
    let price = 'Cena dohodou';
    const priceElement = doc.querySelector('.listadvlevo table b');
    if (priceElement) {
        price = priceElement.textContent.replace(/\s+/g, ' ').trim();
    } else {
        // Fallback: pokus najít cenu v meta tagu, pokud v tabulce není
        const metaPrice = doc.querySelector('meta[name="description"]')?.getAttribute('content');
        if (metaPrice) {
            const priceMatch = metaPrice.match(/Cena:\s*([\d\s]+Kč)/);
            if (priceMatch && priceMatch[1]) {
                price = priceMatch[1].replace(/\s+/g, ' ').trim();
            }
        }
    }


    return {
        url: adUrl,
        title: doc.querySelector('h1.nadpisdetail')?.textContent.trim() || 'N/A',
        price: price,
        description,
        structuredData,
        imageUrls
    };
}

// --- HLAVNÍ FUNKCE-ORCHESTRÁTOR ---
serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
        const { query } = await req.json();
        if (!query) throw new Error("Missing 'query' parameter.");

        const modelSuggestionPrompt = `User wants a car. Their query is: "${query}". Based on this, suggest up to 3 specific car models that are good fits. Your response MUST be a JSON array of strings. For example: ["Škoda Octavia RS", "VW Golf GTI", "Ford Focus ST"]`;
        const suggestedModelsResult = await model.generateContent(modelSuggestionPrompt);
        const suggestedModels = JSON.parse(suggestedModelsResult.response.text());

        const scrapePromises = suggestedModels.map((modelName: string) => scrapeAllSummaries(modelName));
        const allAdsArrays = await Promise.all(scrapePromises);
        const allAdsSummaries = allAdsArrays.flat();

        const rankerPrompt = `From this list of ads: ${JSON.stringify(allAdsSummaries)}, select the TOP 3 best offers. Your response MUST be a JSON array of the 3 string URLs.`;
        const rankerResult = await model.generateContent(rankerPrompt);
        const top3Urls = JSON.parse(rankerResult.response.text());

        const analysisPromises = top3Urls.map(async (url: string) => {
            const adDetails = await fetchAdDetails(url);
            if (!adDetails) return null;
            
            const analystPrompt = `Analyze this ad for a ${adDetails.title}. Ad data: ${JSON.stringify(adDetails)}. Provide a structured analysis in Czech. Your response MUST be a single valid JSON object following this schema: { "vehicle_summary": { "details": { "Model": "${adDetails.title}", "Cena": "${adDetails.price}", "Rok": "${adDetails.structuredData['rok_výroby'] || 'Neznámý'}", "Nájezd": "${adDetails.structuredData['najeto'] || 'Neznámý'}", "Výkon": "${adDetails.structuredData['výkon'] || 'Neznámý'}" }, "general_model_info": "string" }, "analysis": { "pros": ["string"], "cons": ["string"], "questions_for_seller": ["string"] } }`;
            const analystResult = await model.generateContent(analystPrompt);
            const analysis = JSON.parse(analystResult.response.text());
            
            return { ...adDetails, analysis };
        });

        const finalResults = (await Promise.all(analysisPromises)).filter(res => res !== null);

        return new Response(JSON.stringify(finalResults), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    } catch (error) {
        console.error("Error in master-pipeline:", error);
        return new Response(JSON.stringify({ error: error.message, stack: error.stack }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }
});