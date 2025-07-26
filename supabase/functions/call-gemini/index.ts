// supabase/functions/call-gemini/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// FIX 1: Using "npm:" specifier for more reliable imports in Supabase
import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.14.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { user_request } = await req.json();
    if (!user_request) throw new Error("Chybí 'user_request'.");

    const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!);
    
    // FIX 2: Using a valid model name ("gemini-2.5-pro")
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-pro",
    });

    const prompt = `
      Analyzuj požadavek uživatele a navrhni 2-3 modely aut. Odpověz POUZE jako JSON pole objektů.
      Požadavek: "${user_request}"
      Každý objekt musí mít klíče "make" a "model" v SEO formátu (malá písmena, bez diakritiky, pomlčky místo mezer).
      Příklad: [{"make": "skoda", "model": "superb"}, {"make": "volkswagen", "model": "passat"}]
    `;

    // FIX 3: Using JSON mode for robust response handling
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        response_mime_type: "application/json", // This enables JSON mode
      },
    });
    
    // With JSON mode, the response is always valid JSON, so no more manual string cleaning is needed.
    const responseText = result.response.text();
    const jsonData = JSON.parse(responseText);

    return new Response(JSON.stringify(jsonData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in call-gemini function:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});