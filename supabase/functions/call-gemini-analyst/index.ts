// supabase/functions/call-gemini-analyst/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai";

console.log('✅ "call-gemini-analyst" v2.1 (Robust) initialized');

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
if (!GEMINI_API_KEY) {
    console.error("FATAL: GEMINI_API_KEY is not set.");
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { adDetails } = await req.json();
        if (!adDetails) {
            throw new Error('Missing "adDetails" in the request body.');
        }

        const prompt = `
            You are a top-tier car expert and appraiser for the Czech market.
            Your task is to perform a comprehensive analysis of a single classified ad.
            Provide a structured, critical, and honest evaluation for a potential buyer.

            Ad details in JSON format:
            ${JSON.stringify(adDetails, null, 2)}

            YOUR TASK:
            Return a single, valid JSON object in Czech with the following structure. Be meticulous and detailed.

            {
              "pros": [
                "A bulleted list of positive points. Add a short explanation for each (e.g., 'Nová STK do 2026', 'Detailní popis servisu vč. faktur')."
              ],
              "cons": [
                "A bulleted list of negative points or red flags (e.g., 'Krátký a nejasný popis', 'Možná koroze pátých dveří dle fotek')."
              ],
              "questions_for_seller": [
                "A bulleted list of specific, crucial questions to ask the seller (e.g., 'Byly měněny rozvody a v kolika km?', 'Je možné auto zvednout na zvedáku?')."
              ],
              "summary_verdict": "A final, one-paragraph summary verdict. Conclude whether this car is worth a closer look, for whom it is suitable, and what initial investments might be expected.",
              "price_evaluation": {
                 "estimated_price_min": 1,
                 "estimated_price_max": 1,
                 "analysis": "A detailed, 2-3 sentence analysis of the advertised price. Is it fair, overpriced, or a bargain? Justify your opinion based on mileage, year, equipment, and overall condition."
              }
            }
        `;

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
            },
        });
        
        const responseText = result.response.text();
        const analysis = JSON.parse(responseText);

        // Validace odpovědi od AI
        if (!analysis.pros || !analysis.cons || !analysis.price_evaluation) {
            throw new Error("AI response is missing required fields.");
        }

        return new Response(JSON.stringify(analysis), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error("Error in call-gemini-analyst (v2.1):", error.message);
        return new Response(JSON.stringify({ error: `AI Analyst Error: ${error.message}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});