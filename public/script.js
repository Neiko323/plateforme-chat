const socket = io();

// Éléments DOM Authentification
const authScreen = document.getElementById('auth-screen');
const mainApp = document.getElementById('main-app');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const authUsernameInput = document.getElementById('auth-username');
const authPasswordInput = document.getElementById('auth-password');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authSwitchText = document.getElementById('auth-switch-text');

// Éléments DOM Chat
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');

let isLoginMode = true; 
let currentUser = null;

// Vérification de la session existante
const savedUser = localStorage.getItem('currentUser');
if (savedUser && savedUser !== "undefined") {
    currentUser = JSON.parse(savedUser);
    authScreen.style.display = 'none';
    mainApp.style.display = 'block';
}

// Fonction pour gérer la bascule inscription/connexion
function lierLienBascule() {
    const link = document.getElementById('link-to-register') || document.getElementById('link-to-login');
    if (link) {
        link.onclick = (e) => {
            e.preventDefault();
            isLoginMode = !isLoginMode;
            if (isLoginMode) {
                authTitle.textContent = "Ha, te revoilà !";
                authSubtitle.textContent = "Nous sommes ravis de te revoir !";
                authSubmitBtn.textContent = "Se connecter";
                authSwitchText.innerHTML = `Besoin d'un compte ? <a id="link-to-register">S'inscrire</a>`;
            } else {
                authTitle.textContent = "Créer un compte";
                authSubtitle.textContent = "Rejoins tes potes dès aujourd'hui !";
                authSubmitBtn.textContent = "S'inscrire";
                authSwitchText.innerHTML = `Tu as déjà un compte ? <a id="link-to-login">Se connecter</a>`;
            }
            lierLienBascule();
        };
    }
}
lierLienBascule();

// Soumission du formulaire Connexion / Inscription
authSubmitBtn.addEventListener('click', async () => {
    const username = authUsernameInput.value.trim();
    const password = authPasswordInput.value;

    if (!username || !password) return alert("Remplis tous les champs !");

    const endpoint = isLoginMode ? '/api/login' : '/api/register';

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.error);
        } else {
            if (isLoginMode) {
                currentUser = data.user;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                authScreen.style.display = 'none';
                mainApp.style.display = 'block';
            } else {
                alert(data.message);
                isLoginMode = false; 
                const link = document.getElementById('link-to-register');
                if (link) link.click(); // Repasse en mode connexion
            }
        }
    } catch (err) {
        alert("Erreur de communication avec le serveur.");
    }
});

// --- LOGIQUE CHAT ---

function ajouterMessageEcran(data) {
    const item = document.createElement('li');
    item.innerHTML = `<span class="pseudo">${data.pseudo}</span><span style="color:#dbdee1">${data.texte}</span>`;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
}

form.addEventListener('submit', (e) => {
    e.preventDefault(); 
    const messageTexte = input.value.trim();
    
    if (messageTexte && currentUser) {
        socket.emit('chat message', { 
            pseudo: currentUser.username, 
            texte: messageTexte 
        });
        input.value = ''; 
    }
});

socket.on('chat message', (data) => {
    ajouterMessageEcran(data);
});

socket.on('chargement historique', (messagesHistorique) => {
    messages.innerHTML = '';
    messagesHistorique.forEach((data) => {
        ajouterMessageEcran(data);
    });
});