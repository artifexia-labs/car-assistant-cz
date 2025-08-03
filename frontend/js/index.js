/**
 * Soubor: index.js
 * Popis: Kompletní klientská logika pro Car Assistant CZ, včetně přepínání záložek,
 * volání API a dynamického zobrazování výsledků pro všechny tři funkce.
 * Verze: 2.2 - Vylepšená logika a design formuláře
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
    // === 1. LOGIKA PRO ZÁLOŽKU "CHYTRÉ HLEDÁNÍ" ===
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
            sauto_v2: ["Identifikuji klíčové modely...", "Připravuji cílené vyhledávání...", "Skenuji Sauto.cz...", "Filtruji nejlepší kusy..."],
            sauto_v3: ["Analyzuji váš požadavek...", "Prohledávám Sauto.cz...", "Porovnávám ceny a parametry...", "Hledám skryté klenoty..."],
            bazos: ["Prohledávám Bazos.cz...", "Analyzuji nalezené vozy...", "Generuji report...", "Chvilku strpení..."]
        };

        const sautoModeSelectorHTML = `
            <div class="control-group">
                <span class="control-label">Režim</span>
                <div class="segmented-control">
                    <input type="radio" id="mode-v2" name="search-mode" value="v2">
                    <label for="mode-v2">🎯 Focus v2</label>
                    <input type="radio" id="mode-v3" name="search-mode" value="v3" checked>
                    <label for="mode-v3">🔬 Deep Scan v3</label>
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
        toggleSautoOptions(); // Initial call to set state

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
                functionName = selectedMode === 'v3' ? 'analyze-request-v3-experimental' : 'analyze-request-v2';
                currentLoadingMessages = loadingMessages[selectedMode === 'v3' ? 'sauto_v3' : 'sauto_v2'];
                body = { userQuery };
            } else { // bazos
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
                
                let resultsHTML;
                if (selectedPlatform === 'sauto') {
                    resultsHTML = generateSautoResultsHTML(data);
                } else {
                    if (!Array.isArray(data)) {
                        throw new Error("Odpověď serveru pro Bazos.cz není ve správném formátu.");
                    }
                    resultsHTML = generateBazosResultsHTML(data);
                }
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
                    <div class="rank-badge">#${index + 1} Nejlepší nabídka (Sauto.cz)</div>
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

    function generateBazosResultsHTML(results) {
        if (!results || results.length === 0) {
            return '<div class="summary-message">Pro váš dotaz nebyly na Bazos.cz nalezeny žádné vhodné inzeráty.</div>';
        }
        let html = '';
        results.forEach((result, index) => {
            if (!result || !result.analysis) return;

            const analysis = result.analysis;
            const summary = analysis.vehicle_summary;
            const pros_html = analysis.analysis.pros.map(pro => `<li><span class="icon">✅</span>${pro}</li>`).join('');
            const cons_html = analysis.analysis.cons.map(con => `<li><span class="icon">❌</span>${con}</li>`).join('');
            const questions_html = analysis.analysis.questions_for_seller.map(q => `<li><span class="icon">❓</span>${q}</li>`).join('');
            const images_html = result.imageUrls && result.imageUrls.length > 0 ? `<div class="car-gallery">${result.imageUrls.slice(0, 3).map(img => `<img src="${img}" alt="${result.title}" class="car-gallery-image">`).join('')}</div>` : '';
            
            let details_html = '';
            let price = '';
            if (summary && summary.details) {
               details_html = Object.entries(summary.details).map(([key, value]) => {
                   if (key.toLowerCase() === 'cena') {
                       price = value;
                       return ''; // Don't add price to details list
                   }
                   return `<li><span class="icon">🔧</span><strong>${key}:</strong> ${value || 'N/A'}</li>`;
               }).join('');
            }

            html += `
                <div class="car-card">
                    <div class="rank-badge">#${index + 1} Doporučení (Bazos.cz)</div>
                    ${images_html}
                    <div class="car-content-wrapper">
                        <div class="car-title">
                            <h3><a href="${result.url}" target="_blank" rel="noopener noreferrer">${result.title}</a></h3>
                            <div class="car-price">${price}</div>
                        </div>
                         ${summary && summary.general_model_info ? `<div class="car-summary"><strong>Obecné info o modelu:</strong> ${summary.general_model_info}</div>` : ''}
                         <div class="details-section">
                            <h4>Technické parametry</h4>
                            <ul>${details_html}</ul>
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
            if (!adUrl || !adUrl.includes('sauto.cz')) { // Tuto validaci bude možná potřeba upravit pro více platforem
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
                finalizeAction(analyzeAdButton, adResultsDiv, '<span class="button-icon">🔬</span> Analyzovat inzerát', analysisHTML);
            } catch (err) {
                finalizeAction(analyzeAdButton, adResultsDiv, '<span class="button-icon">🔬</span> Analyzovat inzerát', null, err.message);
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
            if (!adUrl || !adUrl.includes('sauto.cz')) { // Tuto validaci bude možná potřeba upravit pro více platforem
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
                finalizeAction(evaluatePriceButton, priceResultsDiv, '<span class="button-icon">💸</span> Ocenit vozidlo', priceHTML);
            } catch (err) {
                finalizeAction(evaluatePriceButton, priceResultsDiv, '<span class="button-icon">💸</span> Ocenit vozidlo', null, err.message);
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