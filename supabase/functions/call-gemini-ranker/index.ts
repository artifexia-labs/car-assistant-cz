// supabase/functions/call-gemini-ranker/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai";

console.log('✅ "call-gemini-ranker" v3 (returns all data) initialized');

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
if (!GEMINI_API_KEY) {
    console.error("FATAL: GEMINI_API_KEY is not set.");
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

function cleanAndParseJson(text: string) {
    const match = text.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonString = match ? match[1] : text;
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.error("Failed to parse JSON from response:", jsonString);
        return [];
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { ads } = await req.json();
        if (!ads || !Array.isArray(ads) || ads.length === 0) {
            throw new Error('Missing or empty "ads" array.');
        }

        const chunkSize = 40;
        let semifinalists = [];

        // --- Fáze 1: Výběr semifinalistů po částech ---
        for (let i = 0; i < ads.length; i += chunkSize) {
            const chunk = ads.slice(i, i + chunkSize);
            const prompt = `
                You are a car market analyst. From the following list of ads, select the top 5 most promising cars.
                Ignore spare parts. Focus on ads that look like complete cars with reasonable prices.
                
                Ads chunk:
                ${JSON.stringify(chunk, null, 2)}

                Return a valid JSON array of the top 5 objects. **IMPORTANT: Each object MUST preserve all original keys: "url", "title", "price", "description_summary", "location", and "imageUrl".**
            `;
            const result = await model.generateContent(prompt);
            const candidates = cleanAndParseJson(result.response.text());
            semifinalists.push(...candidates);
        }

        // --- Fáze 2: Finální analýza a výběr top 20 ---
        const finalPrompt = `
            You are a chief car analyst. From this pre-selected list of promising car ads, perform a final review and select the absolute top 20.
            Rank them from best to worst. The best ad should be first.

            Pre-selected ads:
            ${JSON.stringify(semifinalists, null, 2)}

            Return a valid JSON array of the top 20 ads. Each object must have:
            1. All original keys: "url", "title", "price", "description_summary", "location", "imageUrl".
            2. A new key "reason" (a brief, one-sentence explanation in Czech why it's a good choice).
        `;

        const finalResult = await model.generateContent(finalPrompt);
        const rankedAds = cleanAndParseJson(finalResult.response.text());

        return new Response(JSON.stringify(rankedAds), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error("Error in call-gemini-ranker:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});