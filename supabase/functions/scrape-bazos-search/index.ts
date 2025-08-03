// supabase/functions/scrape-bazos-search/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { DOMParser } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts';
import { corsHeaders } from '../_shared/cors.ts';

console.log('✅ "scrape-bazos-search" function initialized');

// Вспомогательная функция для парсинга одной страницы
async function scrapePage(url: string, baseUrl: string) {
    const response = await fetch(url);
    if (!response.ok) {
        console.error(`Failed to fetch search page: ${url}`);
        return { adUrls: [], nextPageUrl: null };
    }
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc) {
        console.error('Failed to parse search page HTML.');
        return { adUrls: [], nextPageUrl: null };
    }

    // Извлекаем ссылки на объявления
    const adUrls: string[] = [];
    const adElements = doc.querySelectorAll('.inzeraty.inzeratyflex');
    adElements.forEach(el => {
        const link = el.querySelector('.nadpis a');
        const href = link?.getAttribute('href');
        if (href) {
            adUrls.push(href);
        }
    });

    // Ищем ссылку на следующую страницу ("Další")
    let nextPageUrl: string | null = null;
    const paginationLinks = doc.querySelectorAll('.strankovani a');
    paginationLinks.forEach(link => {
        if (link.textContent.trim().includes('Další')) {
            const nextHref = link.getAttribute('href');
            if(nextHref) {
                // Ссылка может быть относительной, поэтому делаем ее абсолютной
                nextPageUrl = new URL(nextHref, baseUrl).href;
            }
        }
    });

    return { adUrls, nextPageUrl };
}


// Основная функция, которая обрабатывает запросы
serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { searchUrl, scrapeAllPages = false } = await req.json();
        if (!searchUrl || !searchUrl.includes('bazos.cz')) {
            throw new Error('Invalid or missing searchUrl parameter.');
        }

        const baseUrl = new URL(searchUrl).origin;
        let allFoundUrls: string[] = [];
        let currentPageUrl: string | null = searchUrl;
        let pagesScraped = 0;
        const maxPages = 10; // Ограничение, чтобы не уйти в бесконечный цикл

        while (currentPageUrl && pagesScraped < maxPages) {
            console.log(`Scraping page ${pagesScraped + 1}: ${currentPageUrl}`);
            const { adUrls, nextPageUrl } = await scrapePage(currentPageUrl, baseUrl);
            allFoundUrls.push(...adUrls);
            pagesScraped++;

            // Если не стоит флаг "scrapeAllPages", выходим после первой страницы
            if (!scrapeAllPages) {
                break;
            }
            currentPageUrl = nextPageUrl;
        }

        return new Response(JSON.stringify({
            searchUrl,
            pagesScraped,
            adCount: allFoundUrls.length,
            adUrls: allFoundUrls,
        }), {
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