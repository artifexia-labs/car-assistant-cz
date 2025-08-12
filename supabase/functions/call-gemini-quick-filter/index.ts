// supabase/functions/call-gemini-quick-filter/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { corsHeaders } from '../_shared/cors.ts';

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
if (!GEMINI_API_KEY) {
    console.error("Chybí GEMINI_API_KEY.");
    // Лучше не падать, а вернуть ошибку, чтобы вызывающая функция могла это обработать
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        if (!GEMINI_API_KEY) throw new Error("Server configuration error: Missing GEMINI_API_KEY.");

        const { userQuery, listings } = await req.json();
        if (!userQuery || !listings) {
            throw new Error("V těle požadavku chybí 'userQuery' nebo 'listings'.");
        }
        
        console.log(`[Quick Filter] Принят запрос на фильтрацию ${listings.length} объявлений по запросу: "${userQuery}"`);

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `
            Jsi vysoce efektivní asistent pro filtrování dat. Tvým úkolem je přijmout textový dotaz uživatele a pole JSON s inzeráty na auta a vrátit POUZE ty inzeráty, které PŘESNĚ odpovídají modelu auta v dotazu.

            Uživatelský dotaz: "${userQuery}"

            Seznam inzerátů (pole JSON):
            ${JSON.stringify(listings.slice(0, 200))} // Ограничиваем на всякий случай, чтобы не превысить лимиты

            PRAVIDLA:
            1. Pečlivě analyzuj název ('title') každého inzerátu.
            2. Ponech v seznamu POUZE ty inzeráty, které se jednoznačně vztahují k modelu uvedenému v uživatelském dotazu. Například, pokud dotaz zní "Alfa Romeo 159", musíš odstranit "Alfa Romeo 147", "Alfa Romeo Giulietta" atd.
            3. Tvoje odpověď MUSÍ být POUZE JSON pole. Žádný další text, žádná vysvětlení, žádné formátování jako \`\`\`json. Jen samotné pole objektů.
        `;

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                response_mime_type: "application/json",
            },
        });
        
        const filteredListings = JSON.parse(result.response.text());
        console.log(`[Quick Filter] Фильтрация завершена. Осталось ${filteredListings.length} релевантных объявлений.`);

        return new Response(JSON.stringify(filteredListings), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("[Quick Filter] Kritická chyba:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});