// supabase/functions/call-gemini-universal-ranker/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { corsHeaders } from '../_shared/cors.ts';

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
if (!GEMINI_API_KEY) {
  throw new Error("Chybí переменная окружения GEMINI_API_KEY");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Используем try...catch на верхнем уровне для перехвата любых ошибок
  let originalListings: any[] = [];
  try {
    const { userQuery, listings } = await req.json();
    originalListings = listings; // Сохраняем исходный список на случай ошибки

    if (!userQuery || !listings) {
      return new Response("Chybí 'userQuery' nebo 'listings'.", { status: 400 });
    }
    
    if (!Array.isArray(listings) || listings.length === 0) {
        return new Response(JSON.stringify([]), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    
    console.log(`[Universal Ranker v3] Spouštím rychlou analýzu pro ${listings.length} inzerátů.`);

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Упрощаем данные для AI, чтобы уменьшить объем запроса и ускорить обработку
    const simplifiedListings = listings.map((car, index) => ({
        id: index, // Добавляем ID для надежного сопоставления
        title: car.title.replace(/\s+/g, ' ').trim(),
        price: car.price,
        year: car.year,
        mileage: car.mileage,
        fuelType: car.fuelType,
        power: car.power
    }));

    const prompt = `
      Jsi expert na český automobilový trh. Tvým úkolem je bleskově ohodnotit relevanci a kvalitu několika inzerátů.

      Uživatelský dotaz: "${userQuery}"

      Zde je JSON pole s inzeráty, které máš ohodnotit:
      ${JSON.stringify(simplifiedListings, null, 2)}

      INSTRUKCE:
      1. Pro KAŽDÝ inzerát v poli přidej POUZE JEDEN nový klíč: "score".
      2. "score" musí být celé číslo od 0 do 100.
         - 100 = Perfektní nabídka, přesně odpovídá dotazu, výhodná cena/stav.
         - 50 = Průměrná nabídka.
         - 0 = Nerelevantní.
      3. Zhodnoť shodu modelu, ceny, roku, nájezdu a motorizace.

      VÝSTUPNÍ FORMÁT:
      Vrať POUZE a VÝHRADNĚ JSON pole objektů. Každý objekt musí obsahovat jen "id" a "score". Neformátuj odpověď do markdown bloku. Jen čistý JSON.
      Příklad: [{"id": 0, "score": 85}, {"id": 1, "score": 55}]
    `;
    
    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
            response_mime_type: "application/json",
        },
    });
    
    const rankedSimplified = JSON.parse(result.response.text());

    // Создаем карту оценок для быстрого доступа
    const scoreMap = new Map(rankedSimplified.map(item => [item.id, item.score]));

    // Соединяем оценки с оригинальными данными
    const finalRankedListings = originalListings.map((originalCar, index) => {
        return {
            ...originalCar,
            score: scoreMap.get(index) ?? 0 // Присваиваем оценку, если она есть, иначе 0
        };
    });

    console.log(`[Universal Ranker v3] Analýza dokončena.`);

    return new Response(JSON.stringify(finalRankedListings), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error(`[Universal Ranker v3] Kritická chyba:`, error.message);
    // В случае любой ошибки возвращаем исходный список БЕЗ ОЦЕНКИ.
    // Это позволяет главной функции работать дальше с отфильтрованными данными.
    return new Response(JSON.stringify(originalListings), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});