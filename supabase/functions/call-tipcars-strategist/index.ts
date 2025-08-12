// supabase/functions/call-tipcars-strategist/index.ts

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

  try {
    const { userQuery } = await req.json();
    if (!userQuery) {
      throw new Error("V těle požadavku chybí 'userQuery'.");
    }

    const prompt = `
      Jsi expert na český trh s ojetými vozy a tvým úkolem je vytvořit 1 až 3 efektivní vyhledávací dotazy pro portál TipCars.com na základě textového požadavku uživatele.

      Požadavek uživatele: "${userQuery}"

      ANALÝZA A POSTUP:
      1.  Identifikuj klíčové parametry: značku, model, typ karoserie (kombi, sedan, SUV), palivo, cenu a další specifika.
      2.  Vytvoř 1 až 3 textové řetězce ("searchText"), které nejlépe pokryjí požadavek.
      3.  Pokud uživatel zmíní konkrétní modely (např. "Superb nebo Passat"), vytvoř dotaz pro každý z nich.
      4.  Pokud je dotaz obecný (např. "rodinné kombi"), navrhni 2-3 populární a spolehlivé modely, které odpovídají segmentu.
      5.  Vždy se snaž co nejvíce specifikovat dotaz, např. "Skoda Superb kombi" je lepší než jen "Superb".

      FORMÁT ODPOVĚDI:
      Tvá odpověď MUSÍ být POUZE ve formátu JSON pole objektů. Každý objekt obsahuje jeden klíč "searchText".
      Nevkládej žádný další text, vysvětlení ani formátování jako \`\`\`json.

      PŘÍKLAD 1:
      Dotaz: "Hledám spolehlivé rodinné kombi do 400 tisíc Kč, automat, nafta, ideálně Superb nebo Passat."
      Odpověď:
      [
        {"searchText": "Skoda Superb kombi nafta automat"},
        {"searchText": "Volkswagen Passat kombi nafta automat"}
      ]

      PŘÍKLAD 2:
      Dotaz: "Nějaké levné auto na dojíždění do práce, stačí malý benzín."
      Odpověď:
      [
        {"searchText": "Skoda Fabia benzin"},
        {"searchText": "Hyundai i20 benzin"},
        {"searchText": "male auto benzin"}
      ]
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        response_mime_type: "application/json",
      },
    });

    const structuredResponse = JSON.parse(result.response.text());

    return new Response(JSON.stringify(structuredResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("Chyba v 'call-tipcars-strategist':", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});