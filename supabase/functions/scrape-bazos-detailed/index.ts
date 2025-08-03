// supabase/functions/scrape-bazos-detailed/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { DOMParser } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts';
import { corsHeaders } from '../_shared/cors.ts';

console.log('✅ "scrape-bazos-detailed" function v3 initialized');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { adUrl } = await req.json();
    if (!adUrl || !adUrl.includes('bazos.cz/inzerat')) {
      throw new Error('Invalid or missing adUrl parameter.');
    }

    const adResponse = await fetch(adUrl);
    if (!adResponse.ok) {
      throw new Error(`Failed to fetch ad page: ${adResponse.statusText}`);
    }
    const adHtml = await adResponse.text();
    const doc = new DOMParser().parseFromString(adHtml, 'text/html');

    if (!doc) {
      throw new Error('Failed to parse HTML document.');
    }

    const title = doc.querySelector('h1.nadpisdetail')?.textContent.trim() || 'N/A';
    const description = doc.querySelector('div.popisdetail')?.textContent.trim() || 'N/A';

    // --- ИСПРАВЛЕНИЕ: Финальная версия парсинга таблицы ---
    let price = 'N/A';
    let location = 'N/A';
    let views = 'N/A';

    // Используем селектор, который нацелен на строки таблицы в левой колонке
    const detailsRows = doc.querySelectorAll('.listadvlevo table tr');

    detailsRows.forEach(row => {
      // Получаем все ячейки (td) в строке
      const cells = row.querySelectorAll('td');
      // Убедимся, что в строке есть хотя бы одна ячейка
      if (cells && cells.length > 0) {
        // Первая ячейка - это наш заголовок
        const header = cells[0].textContent.trim();

        if (header.includes('Cena:')) {
            // Вторая ячейка (index 1) содержит цену
            price = cells[1]?.querySelector('b')?.textContent.trim() || cells[1]?.textContent.trim() || 'Dohodou';
        } else if (header.includes('Lokalita:')) {
            // Третья ячейка (index 2) содержит локацию
            location = cells[2]?.textContent.trim() || 'N/A';
        } else if (header.includes('Vidělo:')) {
            // Вторая ячейка (index 1) содержит просмотры
            views = cells[1]?.textContent.replace('lidí', '').trim() || 'N/A';
        }
      }
    });

    const imageElements = doc.querySelectorAll('.carousel-cell img');
    const imageUrls = Array.from(imageElements).map(img => {
      return img.getAttribute('data-flickity-lazyload') || img.getAttribute('src') || '';
    }).filter(src => src);

    // --- Улучшенная логика получения телефона ---
    let phoneNumber = 'N/A';
    // Сначала ищем простую кнопку/ссылку для отображения номера
    const phoneElement = doc.querySelector('span.teldetail');
    const onclickAttr = phoneElement?.getAttribute('onclick');

    if (onclickAttr) {
        // Это стандартный случай: делаем POST-запрос
        const paramsMatch = onclickAttr.match(/'([^']*)','([^']*)'/);
        if (paramsMatch && paramsMatch.length === 3) {
            const phpFile = paramsMatch[1];
            const postData = paramsMatch[2];

            const phoneResponse = await fetch(`https://auto.bazos.cz${phpFile}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': adUrl },
                body: postData,
            });

            if (phoneResponse.ok) {
                const phoneHtmlOrNumber = await phoneResponse.text();
                // Проверяем, не получили ли мы форму верификации вместо номера
                if (phoneHtmlOrNumber.includes('teloverit')) {
                    phoneNumber = 'Vyžaduje ověření';
                } else {
                    phoneNumber = phoneHtmlOrNumber.trim();
                }
            } else {
                phoneNumber = 'Failed to fetch phone';
            }
        }
    } else if (doc.querySelector('#overlaytel button')) {
        // Если кнопки не было, но на странице уже есть форма верификации
        phoneNumber = 'Vyžaduje ověření';
    }


    const result = {
      source: 'auto.bazos.cz',
      url: adUrl,
      title,
      price: price.replace(/\s+/g, ' ').trim(), // Очистка цены от лишних пробелов
      location,
      views,
      description,
      imageUrls,
      contact: {
        phone: phoneNumber
      },
      rawHtmlForAnalysis: description
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});