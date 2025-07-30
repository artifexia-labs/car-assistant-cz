document.addEventListener('DOMContentLoaded', () => {
    // КОД ДЛЯ ПЕРЕКЛЮЧЕНИЯ ВКЛАДОК
    const tabs = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const adUrlInput = document.getElementById('ad-url'); // Получаем инпут для URL

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            // Не переключать вкладку, если клик был по кнопке анализа
            if (e.target.classList.contains('analyze-deep-btn')) return;

            const tabId = tab.dataset.tab;
            tabs.forEach(item => item.classList.remove('active'));
            tabContents.forEach(item => item.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // Функция для переключения на вкладку анализа
    window.switchToAnalysisTab = (url) => {
        // Устанавливаем URL в инпут
        if (adUrlInput) {
            adUrlInput.value = url;
        }
        // Переключаем табы
        tabs.forEach(item => item.classList.remove('active'));
        tabContents.forEach(item => item.classList.remove('active'));
        
        const analysisTabButton = document.querySelector('.tab-button[data-tab="analysis-tab"]');
        const analysisTabContent = document.getElementById('analysis-tab');

        if (analysisTabButton) analysisTabButton.classList.add('active');
        if (analysisTabContent) analysisTabContent.classList.add('active');

        // Прокручиваем к форме анализа
        analysisTabContent.scrollIntoView({ behavior: 'smooth' });
    };


    // --- ОБЩИЕ ПЕРЕМЕННЫЕ И КЛИЕНТ SUPABASE ---
    const { createClient } = supabase;
    const supabaseClient = createClient('https://zmwnzxypbhjpqwlgyvxi.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptd256eHlwYmhqcHF3bGd5dnhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxNzY2ODAsImV4cCI6MjA2ODc1MjY4MH0.uQGr43bqoPGvfbnnU14sDGfHQLGqcSt-UP4rIJQCU80');

    // --- ЛОГИКА ДЛЯ ВКЛАДКИ "ПОИСК АВТО" ---
    const searchForm = document.getElementById('car-search-form');
    const searchSubmitButton = document.getElementById('submit-button');
    const searchResultsDiv = document.getElementById('results');
    const queryTextarea = document.getElementById('user-query');
    const adContainer = document.getElementById('google-ad-container');

    let loadingInterval; 

    const getRandomInt = (min, max) => {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    };
    
    const loadingMessages = [
        "Vyhledávám nejlepší vozy...",
        `Analyzuji ${getRandomInt(1200, 2800)} inzerátů...`,
        "Porovnávám ceny a parametry...",
        "Kontroluji historii vozidel...",
        "Filtruji nejlepší nabídky...",
        "Připravuji finální doporučení..."
    ];

    if (searchForm) {
        searchForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const userQuery = queryTextarea.value.trim();
            if (!userQuery) {
                alert('Prosím, zadejte svůj požadavek.');
                return;
            }

            searchSubmitButton.disabled = true;
            searchResultsDiv.innerHTML = '';
            
            if(adContainer) adContainer.style.display = 'block';

            let messageIndex = 0;
            searchSubmitButton.innerHTML = `<div class="loader" style="width: 20px; height: 20px; border-width: 2px;"></div> ${loadingMessages[messageIndex]}`;
            
            loadingInterval = setInterval(() => {
                messageIndex = (messageIndex + 1) % loadingMessages.length;
                if (loadingMessages[messageIndex].includes('Analyzuji')) {
                    loadingMessages[messageIndex] = `Analyzuji ${getRandomInt(1200, 2800)} inzerátů...`;
                }
                searchSubmitButton.innerHTML = `<div class="loader" style="width: 20px; height: 20px; border-width: 2px;"></div> ${loadingMessages[messageIndex]}`;
            }, 3500);


            try {
                const { data, error } = await supabaseClient.functions.invoke('analyze-request-v2', {
                    body: { userQuery },
                });

                if (error) throw new Error(data?.error || error.message);
                if (!data) throw new Error("Odpověď ze serveru je neplatná.");
                
                displayResults(data);

            } catch (err) {
                searchResultsDiv.innerHTML = `<div class="error-message">Vyskytla se chyba: ${err.message}</div>`;
            } finally {
                clearInterval(loadingInterval);
                if(adContainer) adContainer.style.display = 'none';
                searchSubmitButton.disabled = false;
                searchSubmitButton.innerHTML = 'Analyzovat nabídky';
            }
        });
    }

    function displayResults(data) {
        searchResultsDiv.innerHTML = '';
        if (data.summary_message) {
            const summaryEl = document.createElement('div');
            summaryEl.className = 'summary-message';
            summaryEl.innerHTML = `<strong>Celkové shrnutí:</strong> ${data.summary_message}`;
            searchResultsDiv.appendChild(summaryEl);
        }
        if (!data.inspected_cars || data.inspected_cars.length === 0) {
            if (!data.summary_message) {
                searchResultsDiv.innerHTML = '<div class="summary-message">Nebyly nalezeny žádné vhodné inzeráty.</div>';
            }
            return;
        }

        data.inspected_cars.forEach((car, index) => {
            const card = document.createElement('div');
            card.className = 'car-card';
            let images_html = '';
            if (car.images && car.images.length > 0) {
                const image_items_html = car.images.slice(0, 3).map(img_url => 
                    `<img src="${img_url}" alt="${car.title}" class="car-gallery-image">`
                ).join('');
                images_html = `<div class="car-gallery">${image_items_html}</div>`;
            }

            const pros_html = car.pros_cz.map(pro => `<li>${pro}</li>`).join('');
            const cons_html = car.cons_cz.map(con => `<li>${con}</li>`).join('');
            const questions_html = car.questions_for_seller_cz.map(q => `<li>${q}</li>`).join('');
            
            const verdict_html = car.final_verdict_cz 
                ? `<div class="details-section verdict">
                     <h4>Verdikt AI</h4>
                     <p>${car.final_verdict_cz.replace(/\n/g, '<br>')}</p>
                   </div>`
                : '';
            
            const vin_html = car.vin
                ? `<div class="vin-code"><strong>VIN:</strong> ${car.vin}</div>`
                : '';

            let seller_info_html = '';
            if (car.seller_info) {
                 seller_info_html = `
                    <div class="details-section seller-info">
                        <h4>Informace o prodejci</h4>
                        <ul>
                            ${car.seller_info.shop_name ? `<li><span class="icon">🏢</span> <a href="${car.seller_info.shop_url || '#'}" target="_blank" rel="noopener noreferrer">${car.seller_info.shop_name}</a></li>` : ''}
                            ${car.seller_info.name && !car.seller_info.shop_name ? `<li><span class="icon">👤</span> ${car.seller_info.name}</li>` : ''}
                            ${car.seller_info.location ? `<li><span class="icon">📍</span> ${car.seller_info.location}</li>` : ''}
                            ${car.seller_info.phone ? `<li><span class="icon">📞</span> <a href="tel:${car.seller_info.phone}">${car.seller_info.phone}</a></li>` : ''}
                        </ul>
                    </div>
                `;
            }

            const deep_analysis_button_html = `
                <button class="analyze-deep-btn" onclick="window.switchToAnalysisTab('${car.url}')">
                    <span class="icon">🔬</span> Hloubková analýza
                </button>`;

            card.innerHTML = `
                <div class="rank-badge">#${index + 1} Nejlepší nabídka</div>
                ${images_html}
                <div class="car-content-wrapper">
                    <div class="car-title">
                        <h3><a href="${car.url}" target="_blank" rel="noopener noreferrer">${car.title}</a></h3>
                        <div class="car-price">${car.price}</div>
                    </div>
                    ${vin_html}
                    <p class="car-summary"><strong>Shrnutí:</strong> ${car.summary_cz}</p>

                    ${verdict_html}

                    <div class="content-columns">
                        <div class="main-analysis">
                            <div class="details-grid">
                                <div class="details-section pros"><h4>Klady</h4><ul>${pros_html}</ul></div>
                                <div class="details-section cons"><h4>Rizika a zápory</h4><ul>${cons_html}</ul></div>
                            </div>
                            <div class="details-section questions">
                                <h4>Doporučené otázky pro prodejce</h4>
                                <ul>${questions_html}</ul>
                            </div>
                        </div>
                        <div class="side-info">
                            ${seller_info_html}
                            ${deep_analysis_button_html}
                        </div>
                    </div>
                </div>`;
            searchResultsDiv.appendChild(card);
        });
    }

    // --- ЛОГИКА ДЛЯ ВКЛАДКИ "АНАЛИЗ ОБЪЯВЛЕНИЯ" ---
    const adAnalysisForm = document.getElementById('ad-analysis-form');
    const analyzeAdButton = document.getElementById('analyze-ad-button');
    const adLoaderContainer = document.getElementById('ad-loader-container');
    const adResultsDiv = document.getElementById('ad-results');

    if (adAnalysisForm) {
        adAnalysisForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const adUrl = adUrlInput.value.trim();
            if (!adUrl || !adUrl.includes('sauto.cz')) {
                alert('Prosím, vložte platný odkaz na inzerát z Sauto.cz.');
                return;
            }

            analyzeAdButton.disabled = true;
            analyzeAdButton.innerHTML = `<div class="loader" style="width: 20px; height: 20px; border-width: 2px;"></div> Analyzuji...`;
            adLoaderContainer.style.display = 'block';
            adResultsDiv.innerHTML = '';

            try {
                const { data, error } = await supabaseClient.functions.invoke('analyze-ad-by-url', {
                    body: { adUrl },
                });

                if (error) throw new Error(data?.error || error.message);
                
                displayAdAnalysis(data);

            } catch (err) {
                adResultsDiv.innerHTML = `<div class="error-message">Vyskytla se chyba: ${err.message}</div>`;
            } finally {
                adLoaderContainer.style.display = 'none';
                analyzeAdButton.disabled = false;
                analyzeAdButton.textContent = 'Analyzovat inzerát';
            }
        });
    }

    function displayAdAnalysis(data) {
        const { original_ad, ai_analysis } = data;

        let images_html = '';
        if (original_ad.images && original_ad.images.length > 0) {
             const image_items_html = original_ad.images.map(img_url => 
                `<img src="${img_url}" alt="${original_ad.title}" class="car-gallery-image">`
            ).join('');
            images_html = `<div class="car-gallery">${image_items_html}</div>`;
        }

        const pros_html = ai_analysis.pros_cz.map(pro => `<li>${pro}</li>`).join('');
        const cons_html = ai_analysis.cons_cz.map(con => `<li>${con}</li>`).join('');
        const questions_html = ai_analysis.questions_for_seller_cz.map(q => `<li>${q}</li>`).join('');

        const recommendation_class = ai_analysis.final_recommendation_cz.includes("Doporučuji") ? "reco-good" : "reco-bad";

        adResultsDiv.innerHTML = `
            <div class="car-card analysis-card">
                 ${images_html}
                <div class="car-content-wrapper">
                    <div class="car-title">
                        <h3><a href="${original_ad.url}" target="_blank" rel="noopener noreferrer">${original_ad.title}</a></h3>
                        <div class="car-price">${original_ad.price}</div>
                    </div>

                    <div class="details-section summary">
                        <h4>Celkové shrnutí od AI</h4>
                        <p>${ai_analysis.summary_cz}</p>
                    </div>

                    <div class="details-grid">
                        <div class="details-section pros"><h4>Klady</h4><ul>${pros_html}</ul></div>
                        <div class="details-section cons"><h4>Rizika a zápory</h4><ul>${cons_html}</ul></div>
                    </div>
                    <div class.details-section questions">
                        <h4>Doporučené otázky pro prodejce</h4>
                        <ul>${questions_html}</ul>
                    </div>
                     <div class="details-section recommendation ${recommendation_class}">
                        <h4>Finální doporučení</h4>
                        <p>${ai_analysis.final_recommendation_cz}</p>
                    </div>
                </div>
            </div>
        `;
    }

    // --- 🔽 НОВАЯ ЛОГИКА ДЛЯ ВКЛАДКИ "ОЦЕНКА СТОИМОСТИ" 🔽 ---
    const priceEvaluationForm = document.getElementById('price-evaluation-form');
    const evaluatePriceButton = document.getElementById('evaluate-price-button');
    const priceLoaderContainer = document.getElementById('price-loader-container');
    const priceResultsDiv = document.getElementById('price-evaluation-results');
    const priceAdUrlInput = document.getElementById('price-ad-url');

    if (priceEvaluationForm) {
        priceEvaluationForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const adUrl = priceAdUrlInput.value.trim();
            if (!adUrl || !adUrl.includes('sauto.cz')) {
                alert('Prosím, vložte platný odkaz na inzerát z Sauto.cz.');
                return;
            }

            evaluatePriceButton.disabled = true;
            evaluatePriceButton.innerHTML = `<div class="loader" style="width: 20px; height: 20px; border-width: 2px;"></div> Oceňuji...`;
            priceLoaderContainer.style.display = 'block';
            priceResultsDiv.innerHTML = '';

            try {
                // Вызываем новую функцию-оркестратор
                const { data, error } = await supabaseClient.functions.invoke('evaluate-price-by-url', {
                    body: { adUrl },
                });

                if (error) throw new Error(data?.error || error.message);
                
                displayPriceEvaluation(data);

            } catch (err) {
                priceResultsDiv.innerHTML = `<div class="error-message">Vyskytla se chyba: ${err.message}</div>`;
            } finally {
                priceLoaderContainer.style.display = 'none';
                evaluatePriceButton.disabled = false;
                evaluatePriceButton.textContent = 'Ocenit vozidlo';
            }
        });
    }

    function displayPriceEvaluation(data) {
        const { original_ad, ai_appraisal } = data;
        
        // Форматирование чисел для цен
        const formatPrice = (price) => new Intl.NumberFormat('cs-CZ').format(price) + ' Kč';

        // Создаем HTML для списков
        const positive_factors_html = ai_appraisal.positive_factors_cz.map(item => `<li>${item}</li>`).join('');
        const negative_factors_html = ai_appraisal.negative_factors_cz.map(item => `<li>${item}</li>`).join('');
        const negotiation_tips_html = ai_appraisal.negotiation_tips_cz.map(item => `<li>${item}</li>`).join('');
        
        const resultCard = `
            <div class="price-evaluation-card">
                <div class="price-evaluation-header">
                     <h3><a href="${original_ad.url}" target="_blank" rel="noopener noreferrer">${original_ad.title}</a></h3>
                     <p class="original-price">Inzerovaná cena: <strong>${original_ad.price}</strong></p>
                </div>
                <div class="price-evaluation-body">
                    <div class="estimated-price-box">
                        <h4>Odhadovaná tržní cena</h4>
                        <div class="price-range">${formatPrice(ai_appraisal.estimated_price_min)} - ${formatPrice(ai_appraisal.estimated_price_max)}</div>
                    </div>

                    <p class="analysis-summary">${ai_appraisal.analysis_summary_cz}</p>

                    <div class="factors-grid">
                        <div class="details-section pros">
                            <h4>Faktory zvyšující cenu</h4>
                            <ul>${positive_factors_html}</ul>
                        </div>
                        <div class="details-section cons">
                            <h4>Faktory snižující cenu</h4>
                            <ul>${negative_factors_html}</ul>
                        </div>
                    </div>
                    
                    <div class="details-section negotiation">
                        <h4>Tipy pro vyjednávání</h4>
                        <ul>${negotiation_tips_html}</ul>
                    </div>
                </div>
            </div>
        `;

        priceResultsDiv.innerHTML = resultCard;
    }
});