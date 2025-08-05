/**
 * Soubor: index.js
 * Popis: Kompletní klientská logika pro proklepniauto.cz
 * Verze: 3.0 - Nové zobrazení výsledků v mřížce (dashboard layout)
 */
document.addEventListener('DOMContentLoaded', () => {
    // --- ZÁKLADNÍ NASTAVENÍ A VÝBĚR ELEMENTŮ ---
    const { createClient } = supabase;
    const supabaseClient = createClient('https://zmwnzxypbhjpqwlgyvxi.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptd256eHlwYmhqcHF3bGd5dnhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxNzY2ODAsImV4cCI6MjA2ODc1MjY4MH0.uQGr43bqoPGvfbnnU14sDGfHQLGqcSt-UP4rIJQCU80');

    const tabs = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const originalButtonTextContent = `<span class="button-icon">🚀</span> Najít nejlepší nabídky`;

    // --- PŘEPÍNÁNÍ ZÁLOŽEK ---
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            tabs.forEach(item => item.classList.remove('active'));
            tabContents.forEach(item => item.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    function finalizeAction(button, resultsDiv, originalButtonText, htmlContent = null, errorMessage = 'Došlo k neznámé chybě.') {
        resultsDiv.innerHTML = htmlContent ? htmlContent : `<div class="error-message">${errorMessage}</div>`;
        button.disabled = false;
        button.innerHTML = originalButtonText;
    }

    // =========================================================================
    // === NOVÁ CENTRÁLNÍ FUNKCE PRO VYKRESLENÍ KARTY VOZU (NOVÝ LAYOUT) ===
    // =========================================================================
    function renderCarCard(car, rank, platform) {
        const images_html = car.images && car.images.length > 0
            ? `<div class="car-gallery">${car.images.slice(0, 4).map(img => `<img src="${img}" alt="${car.title}" class="car-gallery-image">`).join('')}</div>`
            : '<p>Fotografie nejsou k dispozici.</p>';

        const details_html = car.details.map(([key, value]) => `<li><strong>${key}</strong> <span>${value}</span></li>`).join('');
        const pros_html = car.pros.map(pro => `<li><span class="icon">✅</span>${pro}</li>`).join('');
        const cons_html = car.cons.map(con => `<li><span class="icon">❌</span>${con}</li>`).join('');

        return `
            <div class="car-card-new">
                <div class="rank-badge">#${rank} Nejlepší nabídka (${platform})</div>
                <div class="result-grid-layout">
                    
                    <div class="grid-quadrant quadrant-images">
                        <h4>Fotografie</h4>
                        ${images_html}
                    </div>

                    <div class="grid-quadrant quadrant-verdict">
                        <h4>Verdikt & Proč si vybrat</h4>
                        <p>${car.verdict}</p>
                        <h4 style="margin-top: 20px;">Klady</h4>
                        <ul class="pros-list">${pros_html}</ul>
                    </div>

                    <div class="grid-quadrant quadrant-info">
                        <h3 class="car-title-new"><a href="${car.url}" target="_blank" rel="noopener noreferrer">${car.title}</a></h3>
                        <div class="car-price-new">${car.price}</div>
                        <h4>Klíčové parametry</h4>
                        <ul class="details-list">${details_html}</ul>
                        ${car.vin ? `<div class="vin-code" style="margin-top: 20px;"><strong>VIN:</strong> ${car.vin}</div>` : ''}
                    </div>

                    <div class="grid-quadrant quadrant-cons">
                        <h4>Rizika & Zápory</h4>
                        <ul class="cons-list">${cons_html}</ul>
                    </div>
                </div>
            </div>
        `;
    }


    // =========================================================================
    // === LOGIKA PRO ZÁLOŽKU "CHYTRÉ HLEDÁNÍ" ===
    // =========================================================================
    const searchForm = document.getElementById('car-search-form');
    if (searchForm) {
        const searchSubmitButton = document.getElementById('submit-button');
        const searchResultsDiv = document.getElementById('results');
        const queryTextarea = document.getElementById('user-query');
        const platformRadios = document.querySelectorAll('input[name="search-platform"]');
        const sautoOptionsContainer = document.getElementById('sauto-options-container');
        let loadingInterval;

        const loadingMessages = {
            sauto_focus: ["Analyzuji váš dotaz (Focus-v2)...", "Hledám relevantní modely...", "Skenuji Sauto.cz...", "Vybírám nejlepší kandidáty..."],
            sauto_distraction: ["Analyzuji váš požadavek (Distraction-v3)...", "Prohledávám Sauto.cz...", "Porovnávám ceny a parametry...", "Hledám skryté klenoty..."],
            bazos: ["Prohledávám Bazos.cz...", "Analyzuji nalezené vozy...", "Generuji report...", "Chvilku strpení..."]
        };
        
        const sautoModeSelectorHTML = `
            <div class="control-group">
                <span class="control-label">Režim</span>
                <div class="segmented-control">
                    <input type="radio" id="mode-focus-v2" name="search-mode" value="focus-v2" checked>
                    <label for="mode-focus-v2">🚀 Focus-v2</label>
                    <input type="radio" id="mode-distraction-v3" name="search-mode" value="distraction-v3">
                    <label for="mode-distraction-v3">🔬 Distraction-v3</label>
                </div>
            </div>`;
        
        function toggleSautoOptions() {
            const selectedPlatform = document.querySelector('input[name="search-platform"]:checked').value;
            if (selectedPlatform === 'sauto') {
                sautoOptionsContainer.innerHTML = sautoModeSelectorHTML;
                sautoOptionsContainer.style.display = 'block';
            } else {
                sautoOptionsContainer.innerHTML = '';
                sautoOptionsContainer.style.display = 'none';
            }
        }
        
        platformRadios.forEach(radio => radio.addEventListener('change', toggleSautoOptions));
        toggleSautoOptions(); 

        searchForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const userQuery = queryTextarea.value.trim();
            if (!userQuery) {
                alert('Prosím, zadejte svůj požadavek.');
                return;
            }

            searchSubmitButton.disabled = true;
            searchResultsDiv.innerHTML = '';
            clearInterval(loadingInterval);

            const selectedPlatform = document.querySelector('input[name="search-platform"]:checked').value;
            let functionName;
            let body;
            let currentLoadingMessages;

            if (selectedPlatform === 'sauto') {
                const selectedMode = document.querySelector('input[name="search-mode"]:checked').value;
                if (selectedMode === 'focus-v2') {
                    functionName = 'analyze-request-v2';
                    currentLoadingMessages = loadingMessages.sauto_focus;
                } else {
                    functionName = 'analyze-request-v3-experimental';
                    currentLoadingMessages = loadingMessages.sauto_distraction;
                }
                body = { userQuery };
            } else {
                functionName = 'master-pipeline';
                currentLoadingMessages = loadingMessages.bazos;
                body = { query: userQuery };
            }

            let messageIndex = 0;
            const updateLoadingMessage = () => {
                searchSubmitButton.innerHTML = `<div class="loader"></div> ${currentLoadingMessages[messageIndex]}`;
                messageIndex = (messageIndex + 1) % currentLoadingMessages.length;
            };
            updateLoadingMessage();
            loadingInterval = setInterval(updateLoadingMessage, 3500);

            try {
                const { data, error } = await supabaseClient.functions.invoke(functionName, { body });
                if (error) throw error;
                if (!data) throw new Error("Server nevrátil žádná data.");
                
                const resultsHTML = (selectedPlatform === 'sauto')
                    ? generateSautoResultsHTML(data)
                    : generateBazosResultsHTML(data);
                
                finalizeAction(searchSubmitButton, searchResultsDiv, originalButtonTextContent, resultsHTML);
            } catch (err) {
                console.error(err);
                finalizeAction(searchSubmitButton, searchResultsDiv, originalButtonTextContent, null, `Chyba při komunikaci se serverem: ${err.message}`);
            } finally {
                clearInterval(loadingInterval);
            }
        });
    }

    function generateSautoResultsHTML(data) {
        let html = '';
        if (data.summary_message) {
            html += `<div class="summary-message"><strong>Celkové shrnutí:</strong><br>${data.summary_message}</div>`;
        }
        if (!data.inspected_cars || data.inspected_cars.length === 0) {
            return html += '<div class="summary-message">Nebyly nalezeny žádné vhodné inzeráty. Zkuste prosím upravit svůj dotaz.</div>';
        }

        data.inspected_cars.forEach((car, index) => {
            const analysis = car.ai_analysis || car;
            const details = car.vehicle_details_widget || {};

            const standardizedCar = {
                title: car.title || details.Model || 'N/A',
                url: car.url,
                price: car.price || details.Cena || 'N/A',
                images: car.images || [],
                vin: car.vin || details.VIN || null,
                verdict: analysis.final_verdict_cz || 'AI verdikt není k dispozici.',
                pros: analysis.pros_cz || [],
                cons: analysis.cons_cz || [],
                details: Object.entries(details)
            };
            html += renderCarCard(standardizedCar, index + 1, 'Sauto.cz');
        });
        return html;
    }

    function generateBazosResultsHTML(results) {
        if (!results || results.length === 0) {
            return '<div class="summary-message">Pro váš dotaz nebyly na Bazos.cz nalezeny žádné vhodné inzeráty.</div>';
        }
        let html = '';
        results.forEach((car, index) => {
            if (!car || !car.analysis) return;

            const analysis = car.analysis;
            const summary = analysis.vehicle_summary || {};

            const standardizedCar = {
                title: car.title,
                url: car.url,
                price: car.price,
                images: car.imageUrls || [],
                vin: null, // Bazos typically doesn't have VIN
                verdict: summary.general_model_info || 'AI verdikt není k dispozici.',
                pros: analysis.analysis.pros || [],
                cons: analysis.analysis.cons || [],
                details: summary.details ? Object.entries(summary.details) : []
            };

            html += renderCarCard(standardizedCar, index + 1, 'Bazos.cz');
        });
        return html;
    }

    // =========================================================================
    // === LOGIKA PRO ZÁLOŽKU "ANALÝZA & OCENĚNÍ" (zůstává beze změny) ===
    // =========================================================================
    const adAnalysisForm = document.getElementById('ad-analysis-form');
    if (adAnalysisForm) {
        // ... stávající kód pro analýzu z URL zůstává zde ...
        // Tato funkce je nezávislá a její layout se nemění.
        const analyzeAdButton = document.getElementById('analyze-ad-button');
        const adResultsDiv = document.getElementById('ad-results');
        const adUrlInputForAnalysis = document.getElementById('ad-url');

        adAnalysisForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const adUrl = adUrlInputForAnalysis.value.trim();
            if (!adUrl || !adUrl.includes('sauto.cz')) {
                alert('Prosím, vložte platný odkaz na inzerát z Sauto.cz.');
                return;
            }

            analyzeAdButton.disabled = true;
            analyzeAdButton.innerHTML = `<div class="loader"></div> Prověřuji a oceňuji...`;
            adResultsDiv.innerHTML = '';

            try {
                const { data, error } = await supabaseClient.functions.invoke('analyze-ad-by-url', { body: { adUrl } });
                if (error) throw error;
                const analysisHTML = generateAdAnalysisHTML(data);
                finalizeAction(analyzeAdButton, adResultsDiv, '<span class="button-icon">🔬</span> Prověřit a Ocenit', analysisHTML);
            } catch (err) {
                finalizeAction(analyzeAdButton, adResultsDiv, '<span class="button-icon">🔬</span> Prověřit a Ocenit', null, err.message);
            }
        });
    }

    function generateAdAnalysisHTML(data) {
        // ... stávající kód pro vykreslení analýzy z URL zůstává zde ...
        const { vehicle_details_widget, ai_analysis, original_ad } = data;
        const widget_html = Object.entries(vehicle_details_widget)
            .map(([key, value]) => `<li><strong>${key}:</strong> <span>${value}</span></li>`)
            .join('');
        const images_html = original_ad.images && original_ad.images.length > 0
            ? `<div class="car-gallery">${original_ad.images.map(img => `<img src="${img}" alt="Fotka vozu" class="car-gallery-image">`).join('')}</div>`
            : '';
        const pros_html = ai_analysis.pros.map(pro => `<li><span class="icon">✅</span>${pro}</li>`).join('');
        const cons_html = ai_analysis.cons.map(con => `<li><span class="icon">❌</span>${con}</li>`).join('');
        const questions_html = ai_analysis.questions_for_seller.map(q => `<li><span class="icon">❓</span>${q}</li>`).join('');
        const formatPrice = (price) => new Intl.NumberFormat('cs-CZ').format(price) + ' Kč';
        return `
            <div class="car-card">
                ${images_html}
                <div class="car-content-wrapper">
                    <div class="car-title">
                        <h3><a href="${original_ad.url}" target="_blank" rel="noopener noreferrer">${vehicle_details_widget.Model}</a></h3>
                        <div class="car-price">${vehicle_details_widget.Cena}</div>
                    </div>
                    <div class="details-section">
                        <h4>Klíčové parametry vozu</h4>
                        <ul class="widget-list">${widget_html}</ul>
                    </div>
                    <div class="price-evaluation-body">
                        <div class="estimated-price-box">
                            <h4>Odhadovaná tržní cena</h4>
                            <div class="price-range">${formatPrice(ai_analysis.price_evaluation.estimated_price_min)} - ${formatPrice(ai_analysis.price_evaluation.estimated_price_max)}</div>
                        </div>
                        <p class="analysis-summary"><strong>Hodnocení ceny:</strong> ${ai_analysis.price_evaluation.analysis}</p>
                    </div>
                    <div class="details-section verdict">
                        <h4>Finální verdikt AI</h4>
                        <p>${ai_analysis.summary_verdict}</p>
                    </div>
                    <div class="details-grid">
                        <div class="details-section pros"><h4>Klady</h4><ul>${pros_html}</ul></div>
                        <div class="details-section cons"><h4>Rizika a zápory</h4><ul>${cons_html}</ul></div>
                    </div>
                    <div class="details-section questions">
                        <h4>Doporučené otázky pro prodejce</h4>
                        <ul>${questions_html}</ul>
                    </div>
                </div>
            </div>
            <style>
              .widget-list { list-style: none; padding: 0; margin: 0; column-count: 2; column-gap: 20px; }
              .widget-list li { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f2f5; }
              .widget-list li strong { color: var(--text-color); }
              .widget-list li span { color: var(--subtle-text); }
              @media (max-width: 768px) { .widget-list { column-count: 1; } }
            </style>
        `;
    }
});