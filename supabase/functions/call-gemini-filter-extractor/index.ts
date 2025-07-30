// /supabase/functions/call-gemini-filter-extractor/index.ts
import { serve } from 'std/http';
import { GoogleGenerativeAI } from "@google/generative-ai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!);

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
      Jsi expert na analýzu požadavků na nákup ojetých vozů v Česku. Tvým úkolem je rozebrat textový požadavek uživatele a extrahovat z něj POUZE filtry pro vyhledávací API portálu Sauto.cz. Nehádej konkrétní značky ani modely aut.

      Požadavek uživatele: "${userQuery}"

      Tvá odpověď MUSÍ být POUZE ve formátu JSON a obsahovat hlavní objekt s klíčem "filters".
      Pokud parametr v požadavku není specifikován, NEUVÁDĚJ ho v objektu. Podporované filtry jsou:
         - "price_to": Maximální cena (jako číslo, např. 250000)
         - "tachometer_to": Maximální nájezd v km (jako číslo, např. 150000)
         - "fuel": Typ paliva (použij jednu z hodnot: "benzin", "nafta", "hybridni", "lpg", "cng", "elektro")
         - "gearbox": Převodovka (použij jednu z hodnot: "manualni", "automaticka")
         - "body_type_seo": Typ karoserie (např. "kombi", "suv", "sedan", "hatchback", "mpv")
         - "year_from": Minimální rok výroby (jako číslo)
         - "condition_seo": Stav vozu (použij "ojete", pokud se mluví o ojetině, nebo "predvadeci")

      Příklad odpovědi pro dotaz "Hledám spolehlivé rodinné kombi do 400 tisíc Kč, automat, nafta, nájezd max 100 000 km, od roku 2018.":
      {
        "filters": {
          "price_to": 400000,
          "tachometer_to": 100000,
          "fuel": "nafta",
          "gearbox": "automaticka",
          "body_type_seo": "kombi",
          "year_from": 2018,
          "condition_seo": "ojete"
        }
      }
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
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
    console.error("Chyba v 'call-gemini-filter-extractor':", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});