/**
 * Soubor: index.js
 * Popis: Kompletní klientská logika pro Car Assistant CZ, včetně přepínání záložek,
 * volání API a dynamického zobrazování výsledků pro všechny tři funkce.
 * Verze: 2.0 (Kompletní a vylepšená)
 */
document.addEventListener('DOMContentLoaded', () => {
    // --- ZÁKLADNÍ NASTAVENÍ A VÝBĚR ELEMENTŮ ---
    const { createClient } = supabase;
    const supabaseClient = createClient('https://zmwnzxypbhjpqwlgyvxi.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptd256eHlwYmhqcHF3bGd5dnhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxNzY2ODAsImV4cCI6MjA2ODc1MjY4MH0.uQGr43bqoPGvfbnnU14sDGfHQLGqcSt-UP4rIJQCU80');

    const tabs = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

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

    /**
     * Zobrazí výsledky v zadaném kontejneru a vypne stav načítání.
     * @param {HTMLElement} button - Tlačítko, které spustilo akci.
     * @param {HTMLElement} resultsDiv - Kontejner pro zobrazení výsledků.
     * @param {string} originalButtonText - Původní text tlačítka.
     * @param {string | null} htmlContent - HTML obsah pro zobrazení, nebo null pro chybovou zprávu.
     * @param {string} errorMessage - Chybová zpráva pro případ selhání.
     */
    function finalizeAction(button, resultsDiv, originalButtonText, htmlContent = null, errorMessage = 'Došlo k neznámé chybě.') {
        resultsDiv.innerHTML = htmlContent ? htmlContent : `<div class="error-message">${errorMessage}</div>`;
        button.disabled = false;
        button.innerHTML = originalButtonText;
    }

    // =========================================================================
    // === 1. LOGIKA PRO ZÁLOŽKU "HLEDÁNÍ OJEtÉHO VOZU" ===
    // =========================================================================
    const searchForm = document.getElementById('car-search-form');
    if (searchForm) {
        const searchSubmitButton = document.getElementById('submit-button');
        const searchResultsDiv = document.getElementById('results');
        const queryTextarea = document.getElementById('user-query');
        let loadingInterval;

        const loadingMessages = {
            v2: ["Identifikuji klíčové modely...", "Připravuji cílené vyhledávání...", "Skenuji nabídky...", "Filtruji nejlepší kusy..."],
            v3: ["Analyzuji váš požadavek...", "Prohledávám širokou nabídku vozů...", "Porovnávám ceny a parametry...", "Hledám skryté klenoty na trhu..."]
        };

        const searchModeSelectorHTML = `
            <div class="search-mode-selector">
                <input type="radio" id="mode-v2" name="search-mode" value="v2">
                <label for="mode-v2">🎯 Focus v2</label>
                <input type="radio" id="mode-v3" name="search-mode" value="v3" checked>
                <label for="mode-v3">🔬 Deep Scan v3</label>
            </div>`;
        searchSubmitButton.insertAdjacentHTML('beforebegin', searchModeSelectorHTML);

        searchForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const userQuery = queryTextarea.value.trim();
            if (!userQuery) {
                alert('Prosím, zadejte svůj požadavek.');
                return;
            }

            const selectedMode = document.querySelector('input[name="search-mode"]:checked').value;
            const functionName = selectedMode === 'v3' ? 'analyze-request-v3-experimental' : 'analyze-request-v2';
            const currentLoadingMessages = loadingMessages[selectedMode];

            searchSubmitButton.disabled = true;
            searchResultsDiv.innerHTML = '';

            let messageIndex = 0;
            const updateLoadingMessage = () => {
                searchSubmitButton.innerHTML = `<div class="loader"></div> ${currentLoadingMessages[messageIndex]}`;
                messageIndex = (messageIndex + 1) % currentLoadingMessages.length;
            };
            updateLoadingMessage();
            loadingInterval = setInterval(updateLoadingMessage, 3500);

            try {
                const { data, error } = await supabaseClient.functions.invoke(functionName, { body: { userQuery } });

                if (error) throw error;
                if (!data) throw new Error("Server nevrátil žádná data.");
                
                const resultsHTML = generateResultsHTML(data);
                finalizeAction(searchSubmitButton, searchResultsDiv, 'Analyzovat nabídky', resultsHTML);

            } catch (err) {
                finalizeAction(searchSubmitButton, searchResultsDiv, 'Analyzovat nabídky', null, err.message);
            } finally {
                clearInterval(loadingInterval);
            }
        });
    }
    
    function generateResultsHTML(data) {
        let html = '';
        if (data.summary_message) {
            html += `<div class="summary-message"><strong>Celkové shrnutí:</strong><br>${data.summary_message}</div>`;
        }
        if (!data.inspected_cars || data.inspected_cars.length === 0) {
            if (!data.summary_message) {
                html += '<div class="summary-message">Nebyly nalezeny žádné vhodné inzeráty. Zkuste prosím upravit svůj dotaz nebo změnit režim hledání.</div>';
            }
            return html;
        }

        data.inspected_cars.forEach((car, index) => {
            const pros_html = car.pros_cz.map(pro => `<li><span class="icon">✅</span>${pro}</li>`).join('');
            const cons_html = car.cons_cz.map(con => `<li><span class="icon">❌</span>${con}</li>`).join('');
            const questions_html = car.questions_for_seller_cz.map(q => `<li><span class="icon">❓</span>${q}</li>`).join('');
            const images_html = car.images && car.images.length > 0 ? `<div class="car-gallery">${car.images.slice(0, 3).map(img => `<img src="${img}" alt="${car.title}" class="car-gallery-image">`).join('')}</div>` : '';

            html += `
                <div class="car-card">
                    <div class="rank-badge">#${index + 1} Nejlepší nabídka</div>
                    ${images_html}
                    <div class="car-content-wrapper">
                        <div class="car-title">
                            <h3><a href="${car.url}" target="_blank" rel="noopener noreferrer">${car.title}</a></h3>
                            <div class="car-price">${car.price}</div>
                        </div>
                        ${car.vin ? `<div class="vin-code"><strong>VIN:</strong> ${car.vin}</div>` : ''}
                        <p class="car-summary">${car.summary_cz}</p>
                        ${car.final_verdict_cz ? `<div class="details-section verdict"><h4>Verdikt AI</h4><p>${car.final_verdict_cz.replace(/\n/g, '<br>')}</p></div>` : ''}
                        <div class="details-grid">
                            <div class="details-section pros"><h4>Klady</h4><ul>${pros_html}</ul></div>
                            <div class="details-section cons"><h4>Rizika a zápory</h4><ul>${cons_html}</ul></div>
                        </div>
                        <div class="details-section questions">
                            <h4>Doporučené otázky pro prodejce</h4>
                            <ul>${questions_html}</ul>
                        </div>
                    </div>
                </div>`;
        });
        return html;
    }


    // =========================================================================
    // === 2. LOGIKA PRO ZÁLOŽKU "ANALÝZA INZERÁTU" ===
    // =========================================================================
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
            analyzeAdButton.innerHTML = `<div class="loader"></div> Analyzuji...`;
            adResultsDiv.innerHTML = '';

            try {
                const { data, error } = await supabaseClient.functions.invoke('analyze-ad-by-url', { body: { adUrl } });
                if (error) throw error;
                const analysisHTML = generateAdAnalysisHTML(data);
                finalizeAction(analyzeAdButton, adResultsDiv, 'Analyzovat inzerát', analysisHTML);
            } catch (err) {
                finalizeAction(analyzeAdButton, adResultsDiv, 'Analyzovat inzerát', null, err.message);
            }
        });
    }

    function generateAdAnalysisHTML(data) {
        const { original_ad, ai_analysis } = data;
        const images_html = original_ad.images && original_ad.images.length > 0 ? `<div class="car-gallery">${original_ad.images.map(img => `<img src="${img}" alt="${original_ad.title}" class="car-gallery-image">`).join('')}</div>` : '';
        const pros_html = ai_analysis.pros_cz.map(pro => `<li><span class="icon">✅</span>${pro}</li>`).join('');
        const cons_html = ai_analysis.cons_cz.map(con => `<li><span class="icon">❌</span>${con}</li>`).join('');
        const questions_html = ai_analysis.questions_for_seller_cz.map(q => `<li><span class="icon">❓</span>${q}</li>`).join('');

        return `
            <div class="car-card">
                ${images_html}
                <div class="car-content-wrapper">
                    <div class="car-title">
                        <h3><a href="${original_ad.url}" target="_blank" rel="noopener noreferrer">${original_ad.title}</a></h3>
                        <div class="car-price">${original_ad.price}</div>
                    </div>
                    <div class="details-section verdict"><h4>Celkové shrnutí od AI</h4><p>${ai_analysis.summary_cz}</p></div>
                    <div class="details-grid">
                        <div class="details-section pros"><h4>Klady</h4><ul>${pros_html}</ul></div>
                        <div class="details-section cons"><h4>Rizika a zápory</h4><ul>${cons_html}</ul></div>
                    </div>
                    <div class="details-section questions"><h4>Doporučené otázky pro prodejce</h4><ul>${questions_html}</ul></div>
                    <div class="details-section verdict"><h4>Finální doporučení</h4><p>${ai_analysis.final_recommendation_cz}</p></div>
                </div>
            </div>`;
    }

    // =========================================================================
    // === 3. LOGIKA PRO ZÁLOŽKU "OCENĚNÍ CENY" ===
    // =========================================================================
    const priceEvaluationForm = document.getElementById('price-evaluation-form');
    if (priceEvaluationForm) {
        const evaluatePriceButton = document.getElementById('evaluate-price-button');
        const priceResultsDiv = document.getElementById('price-evaluation-results');
        const priceAdUrlInput = document.getElementById('price-ad-url');

        priceEvaluationForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const adUrl = priceAdUrlInput.value.trim();
            if (!adUrl || !adUrl.includes('sauto.cz')) {
                alert('Prosím, vložte platný odkaz na inzerát z Sauto.cz.');
                return;
            }

            evaluatePriceButton.disabled = true;
            evaluatePriceButton.innerHTML = `<div class="loader"></div> Oceňuji...`;
            priceResultsDiv.innerHTML = '';

            try {
                const { data, error } = await supabaseClient.functions.invoke('evaluate-price-by-url', { body: { adUrl } });
                if (error) throw error;
                const priceHTML = generatePriceEvaluationHTML(data);
                finalizeAction(evaluatePriceButton, priceResultsDiv, 'Ocenit vozidlo', priceHTML);
            } catch (err) {
                finalizeAction(evaluatePriceButton, priceResultsDiv, 'Ocenit vozidlo', null, err.message);
            }
        });
    }

    function generatePriceEvaluationHTML(data) {
        const { original_ad, ai_appraisal } = data;
        const formatPrice = (price) => new Intl.NumberFormat('cs-CZ').format(price) + ' Kč';
        const positive_factors_html = ai_appraisal.positive_factors_cz.map(item => `<li><span class="icon">👍</span>${item}</li>`).join('');
        const negative_factors_html = ai_appraisal.negative_factors_cz.map(item => `<li><span class="icon">👎</span>${item}</li>`).join('');
        const negotiation_tips_html = ai_appraisal.negotiation_tips_cz.map(item => `<li><span class="icon">💡</span>${item}</li>`).join('');

        return `
            <div class="price-evaluation-card">
                <div class="price-evaluation-header">
                    <h3><a href="${original_ad.url}" target="_blank" rel="noopener noreferrer">${original_ad.title}</a></h3>
                    <p>Inzerovaná cena: <strong>${original_ad.price}</strong></p>
                </div>
                <div class="price-evaluation-body">
                    <div class="estimated-price-box">
                        <h4>Odhadovaná tržní cena</h4>
                        <div class="price-range">${formatPrice(ai_appraisal.estimated_price_min)} - ${formatPrice(ai_appraisal.estimated_price_max)}</div>
                    </div>
                    <p class="analysis-summary">${ai_appraisal.analysis_summary_cz}</p>
                    <div class="factors-grid">
                        <div class="details-section pros"><h4>Faktory zvyšující cenu</h4><ul>${positive_factors_html}</ul></div>
                        <div class="details-section cons"><h4>Faktory snižující cenu</h4><ul>${negative_factors_html}</ul></div>
                    </div>
                    <div class="details-section negotiation"><h4>Tipy pro vyjednávání</h4><ul>${negotiation_tips_html}</ul></div>
                </div>
            </div>`;
    }
});