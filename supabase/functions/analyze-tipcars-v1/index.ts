// supabase/functions/analyze-tipcars-direct/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { DOMParser, Element } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { corsHeaders } from '../_shared/cors.ts'

const MAX_PAGES_TO_SCRAPE = 5; // Ограничение на 3 страницы, чтобы скрапер работал быстро
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

// Парсер HTML остаётся без изменений
const parseCarsFromHtml = (doc: Document | null): any[] => {
    if (!doc) return [];
    const carData: any[] = [];
    const adsNodeList = doc.querySelectorAll('.advertisement');

    Array.from(adsNodeList).forEach(adNode => {
        const ad = adNode as Element;
        const titleElement = ad.querySelector('.advertisement-name__title h3');
        const subtitleElement = ad.querySelector('.advertisement-name__title p');
        const priceElement = ad.querySelector('.advertisement-name__price h3');
        const linkElement = ad.querySelector('.advertisement-name__title a');
        const imageElement = ad.querySelector('.advertisement__graphics img');

        if (titleElement && priceElement && linkElement) {
            carData.push({
                title: `${titleElement.innerText.trim()} ${subtitleElement ? subtitleElement.innerText.trim() : ''}`.trim(),
                price: priceElement.innerText.trim().replace(/\s+/g, ' '),
                url: new URL(linkElement.getAttribute('href')!, 'https://www.tipcars.com').href,
                imageUrl: imageElement ? imageElement.getAttribute('src') : 'N/A',
            });
        }
    });
    return carData;
};


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userQuery } = await req.json();
    if (!userQuery) throw new Error("V těle požadavku chybí 'userQuery'.");
    if (!GEMINI_API_KEY) throw new Error("Chybí GEMINI_API_KEY.");

    // Для вызова других функций нам нужен клиент Supabase
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    
    // =================================================================================
    // ШАГ 1: СКРЕЙПИНГ
    // =================================================================================
    console.log(`[Direct v4] 1. Запуск скрейпера для: "${userQuery}"`);
    const allCars: any[] = [];
    const firstPageUrl = `https://www.tipcars.com/?text=${encodeURIComponent(userQuery)}`;
    const response = await fetch(firstPageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) throw new Error(`Chyba při dotazu na TipCars: ${response.statusText}`);
    
    const htmlText = await response.text();
    const doc = new DOMParser().parseFromString(htmlText, 'text/html');
    if(!doc) throw new Error("Nepodařilo se parsovat HTML.");

    allCars.push(...parseCarsFromHtml(doc));

    const pageLinks = doc.querySelectorAll('.pagination__page__number');
    const lastPageLink = pageLinks.length > 0 ? pageLinks[pageLinks.length - 1] : null;
    const totalPagesFound = lastPageLink ? parseInt(lastPageLink.textContent, 10) : 1;
    const pagesToScrape = Math.min(totalPagesFound, MAX_PAGES_TO_SCRAPE);
    
    if (pagesToScrape > 1) {
        const pagePromises = [];
        for (let i = 2; i <= pagesToScrape; i++) {
            const pageUrl = `https://www.tipcars.com/?str=${i}-20&text=${encodeURIComponent(userQuery)}`;
            pagePromises.push(fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }));
        }
        const pageResponses = await Promise.all(pagePromises);
        for (const res of pageResponses) {
            if (res.ok) {
                const pageHtml = await res.text();
                const pageDoc = new DOMParser().parseFromString(pageHtml, 'text/html');
                allCars.push(...parseCarsFromHtml(pageDoc));
            }
        }
    }
    console.log(`[Direct v4] 2. Скрейпинг завершен. Найдено ${allCars.length} объявлений.`);

    // =================================================================================
    // ШАГ 2: БЫСТРАЯ ФИЛЬТРАЦИЯ "БРЕДА"
    // =================================================================================
    console.log(`[Direct v4] 3. Вызов 'call-gemini-quick-filter' для быстрой фильтрации.`);
    const { data: filteredCars, error: filterError } = await supabaseClient.functions.invoke(
      'call-gemini-quick-filter',
      { body: { userQuery, listings: allCars } }
    );

    if (filterError) throw new Error(`Ошибка быстрой фильтрации: ${filterError.message}`);
    if (!filteredCars || filteredCars.length === 0) {
      console.log(`[Direct v4] После фильтрации не осталось релевантных машин.`);
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[Direct v4] 4. Фильтрация завершена. Осталось ${filteredCars.length} релевантных объявлений.`);


    // =================================================================================
    // ШАГ 3: ФИНАЛЬНОЕ РАНЖИРОВАНИЕ
    // =================================================================================
    console.log(`[Direct v4] 5. Запуск финального ранжирования для ${filteredCars.length} машин.`);
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const rankingPrompt = `
        Jsi expert na český automobilový trh. Tvým úkolem je analyzovat seznam vozů a vybrat 3 NEJLEPШÍ nabídky na základě požadavku uživatele.

        Uživatelský dotaz: "${userQuery}"

        Zde je JSON pole s PŘEDEM FILTROVANÝMI inzeráty:
        ${JSON.stringify(filteredCars, null, 2)}

        Postupuj přesně podle těchto kroků:
        1. Pro KAŽDÝ inzerát v poli vypočítej 'finalScore' (od 0.0 do 1.0) na základě ceny, roku výroby, nájezdu a dalších parametrů, které můžeš odvodit z názvu. Nejlepší nabídka má skóre nejblíže 1.0.
        2. Seřaď celé pole sestupně podle 'finalScore'.
        3. Vrať mi POUZE 3 NEJLEPŠÍ inzeráty z tohoto seřazeného pole.
        4. Tvůj výstup MUSÍ být čistý JSON (pole objektů), bez jakéhokoliv dalšího textu. Každý objekt v poli musí obsahovat VŠECHNA původní pole z inzerátu a navíc pole 'finalScore'.
    `;
    
    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: rankingPrompt }] }],
        generationConfig: {
            response_mime_type: "application/json",
        },
    });
    
    const rankedListings = JSON.parse(result.response.text());
    console.log(`[Direct v4] 6. Ранжирование завершено. Vybráno ${rankedListings.length} nejlepších aut.`);

    // =================================================================================
    // ШАГ 4: OBOHACENÍ DAT DETAILNÍM SCRAPINGEM (НОВЫЙ ШАГ!)
    // =================================================================================
    console.log(`[Direct v4] 7. Spouštím detailní scraping pro top 3 auta.`);
    
    const detailScrapingPromises = rankedListings.map(car => 
        supabaseClient.functions.invoke('scrape-tipcars-url', {
            body: { adUrl: car.url }
        })
    );

    const detailResults = await Promise.all(detailScrapingPromises);

    const enrichedListings = rankedListings.map((car, index) => {
        const details = detailResults[index];
        if (details.error) {
            console.error(`Chyba při scrapingu detailu pro ${car.url}:`, details.error);
            return { ...car, details: null }; // Добавим null, если не получилось
        }
        return { ...car, details: details.data };
    });

    console.log(`[Direct v4] 8. Proces dokončen. Vracím ${enrichedListings.length} obohacených aut.`);
    return new Response(JSON.stringify(enrichedListings), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('[Direct v4] Kritická chyba:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});