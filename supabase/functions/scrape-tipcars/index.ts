// supabase/functions/scrape-tipcars-url/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { DOMParser, Element } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts';
import { corsHeaders } from '../_shared/cors.ts';

// Funkce pro extrakci textu z elementu, pokud existuje
const getText = (element: Element | null, selector: string): string => {
    const selected = element?.querySelector(selector);
    return selected ? (selected as HTMLElement).innerText.trim() : 'N/A';
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { adUrl } = await req.json();
        if (!adUrl) throw new Error("Chybí 'adUrl' v těle požadavku.");

        console.log(`[Scrape Detail] Spouštím scraping pro URL: ${adUrl}`);

        const response = await fetch(adUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!response.ok) throw new Error(`Chyba při stahování stránky: ${response.statusText}`);

        const htmlText = await response.text();
        const doc = new DOMParser().parseFromString(htmlText, 'text/html');
        if (!doc) throw new Error("Nepodařilo se parsovat HTML.");

        // 1. Získání hlavního popisu a poznámky
        const descriptionNode = doc.querySelector('.detail-note .detail-box__long-text');
        const description = descriptionNode ? (descriptionNode as HTMLElement).innerText.trim().replace(/\s+/g, ' ') : "Popis není k dispozici.";

        // 2. Získání základních parametrů
        const basicParams: { [key: string]: string } = {};
        const infoBoxes = doc.querySelectorAll('.detail-info .detail-box-S');
        infoBoxes.forEach(box => {
            const keyElement = box.querySelector('.detail-box__info-icon');
            const valueElement = box;
            if (keyElement && valueElement) {
                let key = (keyElement as HTMLElement).innerText.replace(':', '').trim();
                let value = (valueElement as HTMLElement).innerText.replace(key, '').replace(':', '').trim();
                basicParams[key] = value;
            }
        });
        
        // 3. Získání kompletní výbavy
        const equipment: { [category: string]: string[] } = {};
        const equipmentSections = doc.querySelectorAll('.detail-specs .detail-box-M');
        equipmentSections.forEach(section => {
            const categoryTitle = getText(section, '.detail-box__subtitle');
            const items = Array.from(section.querySelectorAll('ul li')).map(li => (li as HTMLElement).innerText.trim());
            if (categoryTitle !== 'N/A' && items.length > 0) {
                equipment[categoryTitle] = items;
            }
        });

        const carDetails = {
            description,
            parameters: basicParams,
            equipment
        };

        console.log(`[Scrape Detail] Scraping pro ${adUrl} úspěšně dokončen.`);

        return new Response(JSON.stringify(carDetails), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('[Scrape Detail] Kritická chyba:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});