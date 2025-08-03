// supabase/functions/scrape-bazos-summary/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { DOMParser } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts';
import { corsHeaders } from '../_shared/cors.ts';

console.log('✅ "scrape-bazos-summary" v4 (with images) initialized');

async function scrapeSummaryPage(url: string) {
    const response = await fetch(url);
    if (!response.ok) return { ads: [], nextPageUrl: null };
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc) return { ads: [], nextPageUrl: null };

    const ads = [];
    const adElements = doc.querySelectorAll('.inzeraty.inzeratyflex');

    adElements.forEach(el => {
        const titleElement = el.querySelector('h2.nadpis a');
        const imageElement = el.querySelector('img.obrazek'); // Získání elementu obrázku
        const href = titleElement?.getAttribute('href');

        if (href) {
            ads.push({
                url: new URL(href, url).href,
                title: titleElement?.textContent.trim() || 'N/A',
                price: el.querySelector('.inzeratycena b')?.textContent.replace(/\s+/g, ' ').trim() || 'Dohodou',
                description_summary: el.querySelector('.popis')?.textContent.trim() || 'N/A',
                location: el.querySelector('.inzeratylok')?.textContent.trim().replace(/\n/g, ' ') || 'N/A',
                imageUrl: imageElement?.getAttribute('src') || null // Uložení URL obrázku
            });
        }
    });

    let nextPageUrl: string | null = null;
    const paginationLink = Array.from(doc.querySelectorAll('.strankovani a')).find(a => a.textContent.trim().includes('Další'));
    if (paginationLink) {
        const nextHref = paginationLink.getAttribute('href');
        if (nextHref) nextPageUrl = new URL(nextHref, url).href;
    }
    return { ads, nextPageUrl };
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
        const { searchUrl, scrapeAllPages = false } = await req.json();
        if (!searchUrl) throw new Error('Missing searchUrl parameter.');

        let allAds: any[] = [];
        let currentPageUrl: string | null = searchUrl;
        let pagesScraped = 0;
        const maxPages = 22;

        while (currentPageUrl && pagesScraped < maxPages) {
            const { ads, nextPageUrl } = await scrapeSummaryPage(currentPageUrl);
            const filteredAds = ads.filter(ad => ad.title !== 'N/A' && !ad.title.toLowerCase().includes("sada") && !ad.title.toLowerCase().includes("kola") && !ad.title.toLowerCase().includes("pneu"));
            allAds.push(...filteredAds);
            pagesScraped++;
            if (!scrapeAllPages || !nextPageUrl) break;
            currentPageUrl = nextPageUrl;
        }

        return new Response(JSON.stringify({
            source: 'auto.bazos.cz', searchUrl, pagesScraped, adCount: allAds.length, ads: allAds,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }
});