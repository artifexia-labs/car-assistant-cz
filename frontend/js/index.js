document.addEventListener('DOMContentLoaded', () => {
    // КОД ДЛЯ ПЕРЕКЛЮЧЕНИЯ ВКЛАДОК
    const tabs = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(item => item.classList.remove('active'));
            tabContents.forEach(item => item.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });

    // --- ОБЩИЕ ПЕРЕМЕННЫЕ И КЛИЕНТ SUPABASE ---
    const { createClient } = supabase;
    const supabaseClient = createClient('https://zmwnzxypbhjpqwlgyvxi.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptd256eHlwYmhqcHF3bGd5dnhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxNzY2ODAsImV4cCI6MjA2ODc1MjY4MH0.uQGr43bqoPGvfbnnU14sDGfHQLGqcSt-UP4rIJQCU80');

    // --- ЛОГИКА ДЛЯ ВКЛАДКИ "ПОИСК АВТО" ---
    const searchForm = document.getElementById('car-search-form');
    const searchSubmitButton = document.getElementById('submit-button');
    const searchLoaderContainer = document.getElementById('loader-container');
    const searchResultsDiv = document.getElementById('results');
    const queryTextarea = document.getElementById('user-query');
    const adContainer = document.getElementById('google-ad-container'); // <-- Находим контейнер для рекламы

    let loadingInterval; // Переменная для хранения интервала

    // Функция для генерации случайного числа
    const getRandomInt = (min, max) => {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    };
    
    // Массив с сообщениями
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
            
            // Показываем рекламу
            if(adContainer) adContainer.style.display = 'block';

            // Запускаем смену сообщений
            let messageIndex = 0;
            searchSubmitButton.innerHTML = `<div class="loader" style="width: 20px; height: 20px; border-width: 2px;"></div> ${loadingMessages[messageIndex]}`;
            
            loadingInterval = setInterval(() => {
                messageIndex = (messageIndex + 1) % loadingMessages.length;
                // Обновляем число в сообщении, если оно там есть
                 if (loadingMessages[messageIndex].includes('Analyzuji')) {
                    loadingMessages[messageIndex] = `Analyzuji ${getRandomInt(1200, 2800)} inzerátů...`;
                }
                searchSubmitButton.innerHTML = `<div class="loader" style="width: 20px; height: 20px; border-width: 2px;"></div> ${loadingMessages[messageIndex]}`;
            }, 3500); // Меняем каждые 3.5 секунды


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
                // Останавливаем смену сообщений и возвращаем кнопку в исходное состояние
                clearInterval(loadingInterval);
                if(adContainer) adContainer.style.display = 'none'; // Скрываем рекламу
                searchSubmitButton.disabled = false;
                searchSubmitButton.innerHTML = 'Analyzovat nabídky';
            }
        });
    }

    function displayResults(data) {
        // ... (остальной код функции displayResults не меняется)
        searchResultsDiv.innerHTML = '';
        if (data.summary_message) {
            const summaryEl = document.createElement('div');
            summaryEl.className = 'summary-message';
            summaryEl.textContent = data.summary_message;
            searchResultsDiv.appendChild(summaryEl);
        }
        if (!data.inspected_cars || data.inspected_cars.length === 0) {
            if (!data.summary_message) {
                searchResultsDiv.innerHTML = '<div class="summary-message">Nebyly nalezeny žádné vhodné inzeráty.</div>';
            }
            return;
        }

        data.inspected_cars.forEach(car => {
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
            
            card.innerHTML = `
                ${images_html}
                <div class="car-content-wrapper">
                    <div class="car-title">
                        <h3><a href="${car.url}" target="_blank" rel="noopener noreferrer">${car.title}</a></h3>
                        <div class="car-price">${car.price}</div>
                    </div>
                    <p class="car-summary">${car.summary_cz}</p>
                    <div class="details-grid">
                        <div class="details-section pros"><h4>Klady</h4><ul>${pros_html}</ul></div>
                        <div class="details-section cons"><h4>Rizika a zápory</h4><ul>${cons_html}</ul></div>
                    </div>
                    <div class="details-section questions" style="margin-top: 20px;">
                        <h4>Doporučené otázky pro prodejce</h4>
                        <ul>${questions_html}</ul>
                    </div>
                </div>`;
            searchResultsDiv.appendChild(card);
        });
    }

    // --- ЛОГИКА ДЛЯ ВКЛАДКИ "АНАЛИЗ ОБЪЯВЛЕНИЯ" ---
    // ... (эта часть кода остается без изменений)
    const adAnalysisForm = document.getElementById('ad-analysis-form');
    const adUrlInput = document.getElementById('ad-url');
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
                    <div class="details-section questions">
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
});