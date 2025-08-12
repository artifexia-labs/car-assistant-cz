// supabase/functions/analyze-tipcars-direct/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { DOMParser, Element } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { corsHeaders } from '../_shared/cors.ts';

const MAX_PAGES_TO_SCRAPE_PER_QUERY = 2; 
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

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
            
            const car: any = {
                title: `${titleElement.innerText.trim()} ${subtitleElement ? subtitleElement.innerText.trim() : ''}`.trim(),
                price: priceElement.innerText.trim().replace(/\s+/g, ' '),
                url: new URL(linkElement.getAttribute('href')!, 'https://www.tipcars.com').href,
                imageUrl: imageElement ? imageElement.getAttribute('src') : 'N/A',
                year: 'N/A',
                mileage: 'N/A',
                fuelType: 'N/A',
                power: 'N/A'
            };

            const detailBoxes = ad.querySelectorAll('.detail-box-S');
            
            detailBoxes.forEach(box => {
                const text = (box as Element).innerText.trim();
                
                if (text.includes('km')) {
                    car.mileage = text;
                } else if (text.includes('kW')) {
                    car.power = text;
                } else if (text.includes('/') && text.match(/\d+/g)) {
                    car.year = text;
                } else if (['Nafta', 'Benzin', 'Hybrid', 'Elektro', 'LPG', 'CNG'].some(fuel => text.includes(fuel))) {
                    car.fuelType = text;
                }
            });
            
            carData.push(car);
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

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // =================================================================================
    // ШАГ 0: СТРАТЕГИЯ ПОИСКА
    // =================================================================================
    console.log(`[Direct v13] 1. Получение стратегии от 'call-tipcars-strategist' для: "${userQuery}"`);
    const { data: searchStrategies, error: strategistError } = await supabaseClient.functions.invoke(
        'call-tipcars-strategist',
        { body: { userQuery } }
    );

    if (strategistError) throw new Error(`Ошибка стратега: ${strategistError.message}`);
    if (!searchStrategies || searchStrategies.length === 0) {
        console.warn(`[Direct v13] Стратег не вернул результатов. Использую исходный запрос.`);
        searchStrategies.push({ searchText: userQuery });
    }
    console.log(`[Direct v13] 2. Стратегия получена. Запросы:`, searchStrategies.map(s => s.searchText));
    
    // =================================================================================
    // ШАГ 1: МАССОВЫЙ СКРЕЙПИНГ
    // =================================================================================
    const allCars: any[] = [];
    const scrapedUrls = new Set<string>();

    for (const strategy of searchStrategies) {
        const searchText = strategy.searchText;
        console.log(`[Direct v13] 3. Скрейпинг для: "${searchText}"`);
        const firstPageUrl = `https://www.tipcars.com/?text=${encodeURIComponent(searchText)}`;
        const response = await fetch(firstPageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!response.ok) continue;
        
        const htmlText = await response.text();
        const doc = new DOMParser().parseFromString(htmlText, 'text/html');
        if(!doc) continue;

        const foundCars = parseCarsFromHtml(doc);
        foundCars.forEach(car => {
            if (!scrapedUrls.has(car.url)) {
                allCars.push(car);
                scrapedUrls.add(car.url);
            }
        });
    }

    console.log(`[Direct v13] 4. Скрейпинг завершен. Найдено уникальных объявлений: ${allCars.length}`);
    if (allCars.length === 0) {
        return new Response(JSON.stringify([]), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // =================================================================================
    // ШАГ 2: БЫСТРАЯ ФИЛЬТРАЦИЯ
    // =================================================================================
    console.log(`[Direct v13] 5. Быстрая фильтрация через 'call-gemini-quick-filter'.`);
    const { data: filteredCars, error: filterError } = await supabaseClient.functions.invoke(
      'call-gemini-quick-filter',
      { body: { userQuery, listings: allCars } }
    );

    if (filterError) throw new Error(`Ошибка быстрой фильтрации: ${filterError.message}`);
    if (!filteredCars || filteredCars.length === 0) {
      console.warn(`[Direct v13] Быстрый фильтр не вернул результатов. Возвращаю все ${allCars.length} найденных объявлений.`);
      return new Response(JSON.stringify(allCars), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    console.log(`[Direct v13] 6. Фильтрация завершена. Осталось: ${filteredCars.length}`);

    // =================================================================================
    // ШАГ 3: AI ОЦЕНКА И ФИНАЛЬНАЯ ФИЛЬТРАЦИЯ
    // =================================================================================
    console.log(`[Direct v13] 7. Запуск оценки пачками через 'call-gemini-universal-ranker'.`);
    let rankedCars: any[] = [];
    const BATCH_SIZE = 10;

    for (let i = 0; i < filteredCars.length; i += BATCH_SIZE) {
        const batch = filteredCars.slice(i, i + BATCH_SIZE);
        try {
            const { data: rankedBatch, error: rankerError } = await supabaseClient.functions.invoke(
                'call-gemini-universal-ranker',
                { body: { userQuery, listings: batch } }
            );
            if (rankerError) continue;
            if (rankedBatch) rankedCars.push(...rankedBatch);
        } catch (batchError) {
             continue;
        }
    }
    
    if (rankedCars.length === 0) {
      console.warn(`[Direct v13] AI-ранкер не вернул результатов. Возвращаю данные после быстрой фильтрации.`);
      return new Response(JSON.stringify(filteredCars), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ИЗМЕНЕНИЯ ЗДЕСЬ: Фильтруем по score >= 50 и сортируем
    const finalResults = rankedCars
        .filter(car => car.score && car.score >= 50)
        .sort((a, b) => (b.score || 0) - (a.score || 0));

    console.log(`[Direct v13] 8. Оценка завершена. После фильтрации (score >= 50) осталось: ${finalResults.length} объявлений.`);
    
    // =================================================================================
    // ШАГ 4: ВОЗВРАТ РЕЗУЛЬТАТОВ
    // =================================================================================
    return new Response(JSON.stringify(finalResults), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('[Direct v13] Kritická ошибка:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});