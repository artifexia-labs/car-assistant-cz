// /supabase/functions/evaluate-price-by-url/index.ts
import { serve } from "std/http";
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  // Обработка CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Получаем URL из запроса
    const { adUrl } = await req.json();
    if (!adUrl) {
      throw new Error("V těle požadavku chybí 'adUrl'.");
    }

    // Создаем клиент Supabase для вызова других функций
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // --- ШАГ 1: Вызываем функцию для получения деталей объявления ---
    console.log('[Price-Orchestrator] Volám get-ad-details...');
    const { data: detailsData, error: detailsError } = await supabaseClient.functions.invoke(
      'get-ad-details',
      { body: { adUrl } }
    );

    // Проверяем на ошибки
    if (detailsError) throw detailsError;
    const adDetails = detailsData?.ad_details;
    if (!adDetails) {
        throw new Error("Funkce 'get-ad-details' nevrátila platná data.");
    }
    console.log('[Price-Orchestrator] Detaily vozu úspěšně načteny.');


    // --- ШАГ 2: Вызываем "AI-Оценщика" с полученными данными ---
    console.log('[Price-Orchestrator] Volám call-gemini-appraiser...');
    const { data: appraisalData, error: appraisalError } = await supabaseClient.functions.invoke(
      'call-gemini-appraiser',
      { body: { adDetails } } // Передаем объект adDetails напрямую
    );

    // Проверяем на ошибки
    if (appraisalError) throw appraisalError;
    console.log('[Price-Orchestrator] Odpověď od Ocenáře obdržena.');


    // --- ШАГ 3: Собираем финальный результат для отправки на фронтенд ---
    const finalResult = {
        // Добавляем основную информацию из объявления
        original_ad: {
            title: adDetails.name,
            url: adUrl,
            price: `${adDetails.price.toLocaleString('cs-CZ')} Kč`,
            // Формируем ссылки на изображения
            images: adDetails.images?.slice(0, 3).map(img => `https:${img.url}?fl=exf|crr,1.33333,0|res,1024,768,1|wrm,/watermark/sauto.png,10,10|jpg,80,,1`) || []
        },
        // Добавляем результат анализа от AI
        ai_appraisal: appraisalData
    };

    console.log('[Price-Orchestrator] Proces dokončen. Odesílám finální výsledek.');
    // Отправляем скомбинированный ответ
    return new Response(JSON.stringify(finalResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('[Price-Orchestrator] Kritická chyba v procesu:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});