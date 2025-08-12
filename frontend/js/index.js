/**
 * Soubor: index.js
 * Popis: Kompletní klientská logika pro proklepniauto.cz
 * Verze: 4.9 - Definitivní oprava zobrazení pro Sauto a robustní renderování
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
    // === UNIVERZÁLNÍ FUNKCE PRO ZOBRAZENÍ A NORMALIZACI DAT ===
    // =========================================================================
    function normalizeCarData(car, platform) {
        // Normalizace pro Sauto.cz - přizpůsobeno pro "plochou" strukturu
        if (platform === 'sauto') {
            const detailsWidget = car.vehicle_details_widget || {};
            // Manuální sestavení detailů z dostupných dat
            const manualDetails = [
                ['Model', car.title],
                ['Cena', car.price],
                ['VIN', car.vin]
            ];
            
            return {
                platform: 'Sauto.cz',
                title: car.title || 'N/A',
                url: car.url,
                price: car.price,
                images: car.images || [],
                verdict: car.final_verdict_cz || 'Verdikt není k dispozici.',
                pros: car.pros_cz || [],
                cons: car.cons_cz || [],
                details: Object.keys(detailsWidget).length > 0 ? Object.entries(detailsWidget) : manualDetails
            };
        }
        // Normalizace pro Bazos.cz
        if (platform === 'bazos') {
            const analysisData = car.analysis || {};
            const summary = analysisData.vehicle_summary || {};
            const innerAnalysis = analysisData.analysis || {};
            return {
                platform: 'Bazos.cz',
                title: car.title,
                url: car.url,
                price: car.price,
                images: car.imageUrls || [],
                verdict: summary.general_model_info || 'Verdikt není k dispozici.',
                pros: innerAnalysis.pros || [],
                cons: innerAnalysis.cons || [],
                details: summary.details ? Object.entries(summary.details) : []
            };
        }
        return car;
    }


    function renderCarCard(car, rank) {
        // Zobrazení až 8 obrázků
        const images_html = car.images && car.images.length > 0
            ? `<div class="car-gallery">${car.images.slice(0, 8).map(img => `<img src="${img}" alt="${car.title}" class="car-gallery-image">`).join('')}</div>`
            : '<p>Fotografie nejsou k dispozici.</p>';

        let details_html = '';
        if (Array.isArray(car.details)) {
            details_html = car.details
                .filter(item => Array.isArray(item) && typeof item[0] === 'string' && item[1])
                .map(([key, value]) => `<li><strong>${key.charAt(0).toUpperCase() + key.slice(1)}:</strong> <span>${value}</span></li>`)
                .join('');
        }
        
        const pros = car.pros || [];
        const cons = car.cons || [];
        const pros_html = pros.map(pro => `<li><span class="icon">✅</span>${pro}</li>`).join('');
        const cons_html = cons.map(con => `<li><span class="icon">❌</span>${con}</li>`).join('');

        return `
            <div class="car-card-new">
                <div class="rank-badge">#${rank} Nalezeno na (${car.platform})</div>
                <div class="result-grid-layout">
                    <div class="grid-quadrant quadrant-images"><h4>Fotografie</h4>${images_html}</div>
                    <div class="grid-quadrant quadrant-verdict"><h4>Verdikt & Proč si vybrat</h4><p>${car.verdict}</p>${pros_html ? `<h4 style="margin-top: 20px;">Klady</h4><ul class="pros-list">${pros_html}</ul>` : ''}</div>
                    <div class="grid-quadrant quadrant-info"><h3 class="car-title-new"><a href="${car.url}" target="_blank" rel="noopener noreferrer">${car.title}</a></h3><div class="car-price-new">${car.price}</div>${details_html ? `<h4>Klíčové parametry</h4><ul class="details-list">${details_html}</ul>`: ''}</div>
                    <div class="grid-quadrant quadrant-cons">${cons_html ? `<h4>Rizika & Zápory</h4><ul class="cons-list">${cons_html}</ul>` : ''}</div>
                </div>
            </div>`;
    }

    // =========================================================================
    // === LOGIKA PRO VYHLEDÁVÁNÍ (ORCHESTRACE NA FRONT-ENDU) ===
    // =========================================================================
    const searchForm = document.getElementById('car-search-form');
    if (searchForm) {
        const searchSubmitButton = document.getElementById('submit-button');
        const searchResultsDiv = document.getElementById('results');
        const queryTextarea = document.getElementById('user-query');
        const platformCheckboxes = document.querySelectorAll('input[name="platform"]');
        const sautoOptionsContainer = document.getElementById('sauto-options-container');

        const sautoModeSelectorHTML = `
            <div class="control-group">
                <span class="control-label">Režim pro Sauto</span>
                <div class="segmented-control">
                    <input type="radio" id="mode-focus-v2" name="search-mode" value="focus-v2" checked>
                    <label for="mode-focus-v2">🚀 Focus-v2</label>
                    <input type="radio" id="mode-distraction-v3" name="search-mode" value="distraction-v3">
                    <label for="mode-distraction-v3">🔬 Distraction-v3</label>
                </div>
            </div>`;

        function manageSautoOptions() {
            const sautoChecked = document.querySelector('input[value="sauto"]').checked;
            if (sautoChecked) {
                sautoOptionsContainer.innerHTML = sautoModeSelectorHTML;
            } else {
                sautoOptionsContainer.innerHTML = '';
            }
        }
        
        platformCheckboxes.forEach(cb => cb.addEventListener('change', manageSautoOptions));
        manageSautoOptions();

        searchForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const userQuery = queryTextarea.value.trim();
            if (!userQuery) {
                alert('Prosím, zadejte svůj požadavek.');
                return;
            }

            const selectedPlatforms = Array.from(platformCheckboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value);

            if (selectedPlatforms.length === 0) {
                alert('Prosím, vyberte alespoň jednu platformu k prohledání.');
                return;
            }

            searchSubmitButton.disabled = true;
            searchResultsDiv.innerHTML = '';
            
            const loadingMessages = ["Analyzuji váš dotaz...", "Prohledávám vybrané portály...", "Shromažďuji data...", "Generuji report..."];
            let messageIndex = 0;
            const updateLoadingMessage = () => {
                searchSubmitButton.innerHTML = `<div class="loader"></div> ${loadingMessages[messageIndex]}`;
                messageIndex = (messageIndex + 1) % loadingMessages.length;
            };
            updateLoadingMessage();
            const loadingInterval = setInterval(updateLoadingMessage, 3500);

            try {
                const searchPromises = selectedPlatforms.map(platform => {
                    let functionName;
                    let body = { userQuery };

                    if (platform === 'sauto') {
                        const selectedMode = document.querySelector('input[name="search-mode"]:checked')?.value || 'focus-v2';
                        functionName = (selectedMode === 'focus-v2') ? 'analyze-request-v2' : 'analyze-request-v3-experimental';
                    } else if (platform === 'bazos') {
                        functionName = 'master-pipeline';
                        body = { query: userQuery };
                    }

                    if (functionName) {
                        return supabaseClient.functions.invoke(functionName, { body }).then(response => {
                            if (response.error) {
                                console.error(`Chyba pro platformu ${platform}:`, response.error);
                                return { data: null, platform };
                            }
                            return { ...response, platform };
                        });
                    }
                    return Promise.resolve(null);
                });

                const results = await Promise.all(searchPromises.filter(p => p));
                
                let allCars = [];
                let summaryParts = [];

                results.forEach(result => {
                    if (result && result.data) {
                        const platform = result.platform;
                        const cars = result.data.inspected_cars || result.data;
                        let carCount = 0;
                        if (Array.isArray(cars)) {
                           const normalized = cars.map(car => normalizeCarData(car, platform));
                           allCars.push(...normalized);
                           carCount = normalized.length;
                        }
                        summaryParts.push(`Nalezeno ${carCount} vozů na ${platform.charAt(0).toUpperCase() + platform.slice(1)}.`);
                    }
                });
                
                let html = `<div class="summary-message">${summaryParts.join(' ')} Zde je jejich přehled:</div>`;
                if (allCars.length > 0) {
                    allCars.sort((a, b) => b.platform.localeCompare(a.platform));
                    allCars.forEach((car, index) => {
                        html += renderCarCard(car, index + 1);
                    });
                } else {
                     html = '<div class="summary-message">Bohužel se na žádném z vybraných portálů nepodařilo najít vhodné vozy.</div>';
                }
                
                finalizeAction(searchSubmitButton, searchResultsDiv, originalButtonTextContent, html);

            } catch (err) {
                console.error(err);
                finalizeAction(searchSubmitButton, searchResultsDiv, originalButtonTextContent, null, `Došlo k závažné chybě: ${err.message}`);
            } finally {
                clearInterval(loadingInterval);
            }
        });
    }

    // Ostatní kód pro záložku Analýza & Ocenění zůstává stejný...
    const adAnalysisForm = document.getElementById('ad-analysis-form');
    if (adAnalysisForm) {
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
    
        function generateAdAnalysisHTML(data) {
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
    }
});