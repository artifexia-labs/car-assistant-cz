// /js/profile.js
document.addEventListener('DOMContentLoaded', () => {
    const supabaseUrl = 'https://zmwnzxypbhjpqwlgyvxi.supabase.co';
    const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptd256eHlwYmhqcHF3bGd5dnhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxNzY2ODAsImV4cCI6MjA2ODc1MjY4MH0.uQGr43bqoPGvfbnnU14sDGfHQLGqcSt-UP4rIJQCU80";
    const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

    const userEmailEl = document.getElementById('user-email');
    const userCreditsEl = document.getElementById('user-credits');
    const userCreatedAtEl = document.getElementById('user-created-at');
    const linkedAccountsList = document.getElementById('linked-accounts-list');
    const logoutButton = document.getElementById('logout-button');
    const deleteAccountButton = document.getElementById('delete-account-button');
    const messagesDiv = document.getElementById('auth-messages');

    let currentUser = null;

    // --- Pomocné funkce ---
    function showMessage(text, type = 'error') {
        messagesDiv.textContent = text;
        messagesDiv.className = type;
    }

    function formatCzechDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    // --- Funkce pro zobrazení propojených účtů ---
    function renderLinkedAccounts(identities) {
        linkedAccountsList.innerHTML = ''; // Vyčistíme seznam

        const providers = [
            { id: 'google', name: 'Google', icon: 'https://www.svgrepo.com/show/475656/google-color.svg' },
            { id: 'facebook', name: 'Facebook', icon: 'https://www.svgrepo.com/show/448224/facebook.svg' },
            // Můžeš přidat další, např. Apple
        ];

        providers.forEach(provider => {
            const identity = identities.find(id => id.provider === provider.id);
            const isLinked = !!identity;

            const listItem = document.createElement('li');
            listItem.className = 'linked-account-item';
            listItem.innerHTML = `
                <div class="linked-account-info">
                    <img src="${provider.icon}" alt="${provider.name}" class="provider-icon">
                    <span>${provider.name}</span>
                </div>
                <button class="${isLinked ? 'button-unlink' : 'button-link'}" data-provider="${provider.id}">
                    ${isLinked ? 'Odpojit' : 'Propojit'}
                </button>
            `;
            linkedAccountsList.appendChild(listItem);
        });
    }


    // --- Hlavní funkce pro načtení profilu ---
    async function loadUserProfile() {
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError || !session) {
            window.location.href = '/login.html';
            return;
        }
        currentUser = session.user;
        
        userEmailEl.textContent = currentUser.email;
        userCreatedAtEl.textContent = formatCzechDate(currentUser.created_at);
        
        // Zobrazíme propojené účty
        renderLinkedAccounts(currentUser.identities || []);

        // Získáme kredity z tabulky 'profiles'
        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('credits')
            .eq('id', currentUser.id)
            .single();

        if (profile) {
            userCreditsEl.textContent = profile.credits;
        } else {
            console.error('Nepodařilo se načíst profil:', profileError);
        }
    }

    // --- Event Listeners pro tlačítka ---
    logoutButton.addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.href = '/';
    });

    deleteAccountButton.addEventListener('click', async () => {
        if (confirm('Opravdu chcete trvale smazat svůj účet? Tuto akci nelze vrátit zpět.')) {
            showMessage('Mažu účet...', 'success');
            const { error } = await supabaseClient.functions.invoke('delete-user');
            if (error) {
                showMessage(`Chyba při mazání účtu: ${error.message}`);
            } else {
                showMessage('Účet byl úspěšně smazán. Budete odhlášeni.', 'success');
                setTimeout(() => { window.location.href = '/'; }, 2000);
            }
        }
    });

    // Event listener pro propojování a odpojování účtů
    linkedAccountsList.addEventListener('click', async (e) => {
    if (e.target.tagName !== 'BUTTON') return;

    const provider = e.target.dataset.provider;
    const isUnlinking = e.target.classList.contains('button-unlink');

    if (isUnlinking) {
        // ... kód pro odpojování zůstává stejný ...
        if (confirm(`Opravdu chcete odpojit účet ${provider}?`)) {
            const identityToUnlink = currentUser.identities.find(id => id.provider === provider);
            if (identityToUnlink) {
                const { error } = await supabaseClient.auth.unlinkIdentity(identityToUnlink);
                if (error) {
                    showMessage(error.message);
                } else {
                    showMessage(`${provider} účet odpojen.`, 'success');
                    loadUserProfile();
                }
            }
        }
    } else {
        // PROPOJENÍ (ZMĚNA ZDE)
        const options = {};
        if (provider === 'facebook') {
            options.scopes = 'public_profile,email';
        }
        await supabaseClient.auth.linkIdentity({ 
            provider,
            options 
        });
    }
    });

    // Spustíme načtení dat hned po načtení stránky
    loadUserProfile();
});