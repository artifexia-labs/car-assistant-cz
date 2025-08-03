// supabase/functions/call-gemini-analyst/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai";

console.log('✅ "call-gemini-analyst" function initialized');

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Принимаем детальную информацию по ОДНОЙ машине
        const { adDetails } = await req.json();
        if (!adDetails) {
            throw new Error('Missing "adDetails" in the request body.');
        }

        const prompt = `
            You are a meticulous and sharp-eyed car expert reviewing a single classified ad for a potential buyer.
            Analyze the following ad details in JSON format. Your task is to provide a structured, critical analysis.

            Ad details:
            ${JSON.stringify(adDetails, null, 2)}

            YOUR TASK:
            Based on the ad, return a single, valid JSON object with the following structure:
            {
              "pros": [
                "A bulleted list of positive points (e.g., 'Nová STK', 'Detailní popis servisu')."
              ],
              "cons": [
                "A bulleted list of negative points or red flags (e.g., 'Krátký a nejasný popis', 'Možná koroze pátých dveří')."
              ],
              "questions_for_seller": [
                "A bulleted list of specific, important questions to ask the seller via phone (e.g., 'Byly měněny rozvody?', 'Je možné auto zvednout na zvedáku?')."
              ],
              "summary_verdict": "A final, one-paragraph summary verdict in Czech, concluding whether this car is worth a closer look."
            }
            
            Provide your entire response in Czech.
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        // Очистка ответа от ```json
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
        const jsonString = jsonMatch ? jsonMatch[1] : responseText;
        
        const analysis = JSON.parse(jsonString);

        return new Response(JSON.stringify(analysis), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error("Error in call-gemini-analyst:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});