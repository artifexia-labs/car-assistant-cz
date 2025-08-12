// /js/auth.js

// Počkáme, až se celý HTML dokument bezpečně načte
document.addEventListener('DOMContentLoaded', () => {
    
    // --- Inicializace Supabase klienta (OPRAVENO) ---
    const supabaseUrl = 'https://zmwnzxypbhjpqwlgyvxi.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptd256eHlwYmhqcHF3bGd5dnhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxNzY2ODAsImV4cCI6MjA2ODc1MjY4MH0.uQGr43bqoPGvfbnnU14sDGfHQLGqcSt-UP4rIJQCU80';
    // Vytvoříme instanci klienta a uložíme ji do nové proměnné 'supabaseClient'
    const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

    // --- Elementy na stránce ---
    const mainAuthView = document.getElementById('main-auth-view');
    const resetPasswordView = document.getElementById('reset-password-view');

    const formTitle = document.getElementById('form-title');
    const formDescription = document.getElementById('form-description');
    const emailForm = document.getElementById('auth-form-email');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const emailSubmitButton = document.getElementById('submit-button-email');
    const googleAuthButton = document.getElementById('google-auth-button');
    const facebookAuthButton = document.getElementById('facebook-auth-button');
    const switchText = document.getElementById('switch-text');
    const switchLink = document.getElementById('switch-link');
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    const backToLoginLink = document.getElementById('back-to-login-link');
    const resetPasswordForm = document.getElementById('reset-password-form');
    const resetEmailInput = document.getElementById('reset-email');
    const messagesDiv = document.getElementById('auth-messages');

    // Proměnná pro sledování aktuálního režimu (login vs register)
    let isLoginMode = true;

    // --- Funkce pro přepínání pohledů ---
    function switchView(view) {
        messagesDiv.textContent = '';
        messagesDiv.className = '';

        if (view === 'reset') {
            mainAuthView.style.display = 'none';
            resetPasswordView.style.display = 'block';
        } else {
            mainAuthView.style.display = 'block';
            resetPasswordView.style.display = 'none';
            
            isLoginMode = (view === 'login');
            
            const authOptions = document.querySelector('.auth-options');
            if (authOptions) {
                authOptions.style.display = isLoginMode ? 'flex' : 'none';
            }

            formTitle.textContent = isLoginMode ? 'Vítejte zpět!' : 'Vytvořit nový účet';
            formDescription.textContent = isLoginMode ? 'Přihlaste se ke svému účtu.' : 'Registrace je rychlá a snadná.';
            emailSubmitButton.textContent = isLoginMode ? 'Přihlásit se' : 'Zaregistrovat se';
            switchText.textContent = isLoginMode ? 'Ještě nemáte účet?' : 'Už máte účet?';
            switchLink.textContent = isLoginMode ? 'Zaregistrujte se' : 'Přihlaste se';
        }
    }

    // --- Připojení Event Listeners k tlačítkům a odkazům ---
    if (switchLink) {
        switchLink.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(isLoginMode ? 'register' : 'login');
        });
    }

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            switchView('reset');
        });
    }

    if (backToLoginLink) {
        backToLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            switchView('login');
        });
    }

    if (googleAuthButton) {
        googleAuthButton.addEventListener('click', () => signInWithProvider('google'));
    }

    if (facebookAuthButton) {
        facebookAuthButton.addEventListener('click', () => signInWithProvider('facebook'));
    }

    // --- Zobrazení zpráv ---
    function showMessage(text, type = 'error') {
        messagesDiv.textContent = text;
        messagesDiv.className = type;
    }

    // --- Obsluha Email/Heslo formuláře ---
    if (emailForm) {
        emailForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = emailInput.value;
            const password = passwordInput.value;
            
            let response;
            showMessage('Pracuji...', 'success');
            
            if (isLoginMode) {
                response = await supabaseClient.auth.signInWithPassword({ email, password });
            } else {
                response = await supabaseClient.auth.signUp({ email, password });
            }

            if (response.error) {
                showMessage(response.error.message);
            } else if (response.data.user) {
                if (!isLoginMode) {
                    showMessage('Účet vytvořen! Nyní budete přesměrováni.', 'success');
                }
                window.location.href = '/';
            }
        });
    }

    // --- Obsluha Obnovy Hesla ---
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = resetEmailInput.value;
            showMessage('Pracuji...', 'success');

            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin,
            });

            if (error) {
                showMessage(error.message);
            } else {
                showMessage('Zkontrolujte svůj email pro instrukce k obnově hesla.', 'success');
            }
        });
    }

    async function signInWithProvider(provider) {
    const options = {};
    // Facebook vyžaduje, abychom si explicitně řekli o 'public_profile' a 'email'
    if (provider === 'facebook') {
        options.scopes = 'public_profile,email';
    }

    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: provider,
        options: options
    });
    
    if (error) {
        showMessage(error.message);
    }
    }

    // Spustíme kontrolu hned po načtení
    checkUserSession();
    // Nastavíme výchozí pohled na přihlášení
    switchView('login');
});