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

    if (searchForm) {
        searchForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const userQuery = queryTextarea.value.trim();
            if (!userQuery) {
                alert('Prosím, zadejte svůj požadavek.');
                return;
            }

            searchSubmitButton.disabled = true;
            searchSubmitButton.innerHTML = `<div class="loader" style="width: 20px; height: 20px; border-width: 2px;"></div> Pracuji...`;
            searchLoaderContainer.style.display = 'block';
            searchResultsDiv.innerHTML = '';

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
                searchLoaderContainer.style.display = 'none';
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

            // Создаем HTML для галереи изображений
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
            analyzeAdButton.textContent = 'Analyzuji...';
            adLoaderContainer.style.display = 'block';
            adResultsDiv.innerHTML = '';

            try {
                const { data, error } = await supabaseClient.functions.invoke('get-ad-details', { // Убедитесь, что эта функция существует и обновлена
                    body: { adUrl },
                });

                if (error) throw new Error(data?.error || error.message);
                
                displayAdDetails(data.ad_details); // Передаем именно ad_details

            } catch (err) {
                adResultsDiv.innerHTML = `<div class="error-message">Vyskytla se chyba: ${err.message}</div>`;
            } finally {
                adLoaderContainer.style.display = 'none';
                analyzeAdButton.disabled = false;
                analyzeAdButton.textContent = 'Analyzovat inzerát';
            }
        });
    }

    function displayAdDetails(car) {
        // Создаем HTML для галереи изображений
        let images_html = '';
        if (car.images && car.images.length > 0) {
             const image_items_html = car.images.slice(0, 3).map(img => {
                const imageUrl = `https:${img.url}?fl=exf|crr,1.33333,0|res,1024,768,1|wrm,/watermark/sauto.png,10,10|jpg,80,,1`;
                return `<img src="${imageUrl}" alt="Fotka vozu" class="car-gallery-image">`;
            }).join('');
            images_html = `<div class="car-gallery">${image_items_html}</div>`;
        }

        const equipment_html = car.equipment_cb.map(item => `<li>${item.name}</li>`).join('');

        adResultsDiv.innerHTML = `
            <div class="car-card">
                 ${images_html}
                <div class="car-content-wrapper">
                    <div class="car-title">
                        <h3>${car.name}</h3>
                        <div class="car-price">${new Intl.NumberFormat('cs-CZ').format(car.price)} Kč</div>
                    </div>
                    <p class="car-description">${car.description.replace(/\n/g, '<br>')}</p>
                    
                    <div class="details-grid-full">
                        <div class="details-section">
                             <h4><i class="fas fa-info-circle"></i> Základní údaje</h4>
                             <ul>
                                <li><strong>Stav:</strong> ${car.condition_cb.name}</li>
                                <li><strong>Najeto:</strong> ${new Intl.NumberFormat('cs-CZ').format(car.tachometer)} km</li>
                                <li><strong>Vyrobeno:</strong> ${new Date(car.manufacturing_date).toLocaleDateString('cs-CZ')}</li>
                                <li><strong>Karosérie:</strong> ${car.vehicle_body_cb.name}</li>
                                <li><strong>Barva:</strong> ${car.color_cb.name}</li>
                             </ul>
                        </div>
                        <div class="details-section">
                             <h4><i class="fas fa-cogs"></i> Motor a pohon</h4>
                             <ul>
                                <li><strong>Palivo:</strong> ${car.fuel_cb.name}</li>
                                <li><strong>Objem:</strong> ${car.engine_volume} ccm</li>
                                <li><strong>Výkon:</strong> ${car.engine_power} kW (${Math.round(car.engine_power * 1.36)} koní)</li>
                                <li><strong>Převodovka:</strong> ${car.gearbox_cb.name} (${car.gearbox_levels_cb.name})</li>
                                <li><strong>Pohon:</strong> ${car.drive_cb.name}</li>
                             </ul>
                        </div>
                    </div>
                     <div class="details-section" style="margin-top: 20px;">
                        <h4><i class="fas fa-tools"></i> Výbava</h4>
                        <ul class="equipment-list">${equipment_html}</ul>
                    </div>
                </div>
            </div>
        `;
    }
});