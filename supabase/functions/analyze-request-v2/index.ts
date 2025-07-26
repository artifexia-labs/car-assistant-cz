// /supabase/functions/analyze-request-v2/index.ts
import { serve } from "std/http";
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userQuery } = await req.json();
    if (!userQuery) {
      throw new Error("Требуется запрос пользователя ('userQuery')");
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // --- Шаг 1: Вызываем "Стратега" ---
    console.log('[Orchestrator] Вызываю Стратега...');
    const { data: strategistData, error: strategistError } = await supabaseClient.functions.invoke(
      'call-gemini-strategist',
      { body: { userQuery } }
    );
    if (strategistError) throw strategistError;

    // --- Шаг 2: Диагностика и проверка ответа от Стратега ---
    console.log('[Orchestrator] Ответ от Стратега получен. Смотрим, что внутри:');
    console.log(JSON.stringify(strategistData, null, 2));

    // Безопасно извлекаем данные. Gemini может вернуть JSON в виде строки, которую нужно парсить.
    let parsedData = strategistData;
    if (typeof strategistData === 'string') {
        try {
            parsedData = JSON.parse(strategistData);
        } catch (e) {
            console.error('[Orchestrator] Ошибка парсинга ответа от Стратега:', e);
            throw new Error('Strategist returned non-JSON string.');
        }
    }

    const models = parsedData?.models;
    const filters = parsedData?.filters;

    // ГЛАВНАЯ ПРОВЕРКА: Убеждаемся, что у нас есть всё для следующего шага
    if (!models || !Array.isArray(models) || models.length === 0 || !filters) {
      console.error('[Orchestrator] Критическая ошибка: Стратег не вернул "models" или "filters" в ожидаемом формате.');
      throw new Error('Strategist did not return valid models or filters.');
    }
    
    // --- Шаг 3: Вызываем "Сборщика данных" с проверенными данными ---
    console.log('[Orchestrator] Вызываю Сборщика данных (scrape-sauto-detailed)...');
    const { data: carListings, error: scrapeError } = await supabaseClient.functions.invoke(
      'scrape-sauto-detailed', // Имя твоей функции
      { body: { models, filters } } // Передаем оба параметра
    );
    if (scrapeError) throw scrapeError;

    // --- Шаг 4: Вызываем "Инспектора" ---
    console.log('[Orchestrator] Вызываю Инспектора...');
    const { data: inspectorResult, error: inspectorError } = await supabaseClient.functions.invoke(
      'call-gemini-inspector',
      { body: { userQuery, carListings } }
    );
    if (inspectorError) throw inspectorError;

    console.log('[Orchestrator] Процесс завершен. Отправляю результат.');
    return new Response(JSON.stringify(inspectorResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('[Orchestrator] Критическая ошибка в процессе:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});