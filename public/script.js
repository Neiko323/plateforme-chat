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
const typingIndicator = document.getElementById('typing-indicator');

// Éléments DOM Profil
const profileUsername = document.getElementById('profile-username');
const profileAvatar = document.getElementById('profile-avatar');
const profileBioText = document.getElementById('profile-bio-text');
const editAvatarInput = document.getElementById('edit-avatar-url');
const editBioInput = document.getElementById('edit-bio');
const saveProfileBtn = document.getElementById('save-profile-btn');
const logoutBtn = document.getElementById('logout-btn');

let isLoginMode = true; 
let currentUser = null;

// Charger les données de profil à l'écran
function afficherProfilEcran() {
    if (!currentUser) return;
    profileUsername.textContent = `@${currentUser.username}`;
    profileBioText.textContent = currentUser.bio;
    profileAvatar.src = currentUser.avatar;
    editAvatarInput.value = currentUser.avatar;
    editBioInput.value = currentUser.bio;
}

// Vérification de la session existante au chargement
const savedUser = localStorage.getItem('currentUser');
if (savedUser && savedUser !== "undefined") {
    currentUser = JSON.parse(savedUser);
    authScreen.style.display = 'none';
    mainApp.style.display = 'block';
    afficherProfilEcran();
}

// Fonction de bascule inscription/connexion
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

// Soumission Authentification
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
                afficherProfilEcran();
            } else {
                alert(data.message);
                isLoginMode = false; 
                const link = document.getElementById('link-to-register');
                if (link) link.click();
            }
        }
    } catch (err) { alert("Erreur de communication avec le serveur."); }
});

// Enregistrer les modifications du Profil
saveProfileBtn.addEventListener('click', async () => {
    if (!currentUser) return;
    const bio = editBioInput.value.trim();
    const avatarUrl = editAvatarInput.value.trim();

    try {
        const response = await fetch('/api/profile/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, bio, avatarUrl })
        });
        const data = await response.json();

        if (response.ok) {
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            afficherProfilEcran();
            alert("Profil mis à jour ! (Les anciens messages chargeront ta nouvelle pdp au prochain rafraîchissement)");
        } else {
            alert(data.error);
        }
    } catch (err) { alert("Erreur lors de la mise à jour."); }
});

// Déconnexion
logoutBtn.addEventListener('click', () => {
    localStorage.clear();
    location.reload(); // Recharge la page pour revenir à zéro
});

// --- LOGIQUE CHAT ---

function ajouterMessageEcran(data) {
    const item = document.createElement('li');
    // On utilise l'avatar fourni, s'il n'y en a pas, on met un robot par défaut
    const avatar = data.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${data.pseudo}`;
    item.innerHTML = `
        <img class="avatar-chat" src="${avatar}" alt="pdp">
        <div class="msg-content">
            <span class="pseudo">${data.pseudo}</span>
            <span class="texte-message">${data.texte}</span>
        </div>
    `;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
}

form.addEventListener('submit', (e) => {
    e.preventDefault(); 
    const messageTexte = input.value.trim();
    if (messageTexte && currentUser) {
        socket.emit('chat message', { pseudo: currentUser.username, texte: messageTexte, avatar: currentUser.avatar });
        input.value = ''; 
        socket.emit('typing', { pseudo: currentUser.username, isTyping: false });
    }
});

socket.on('chat message', (data) => {
    ajouterMessageEcran(data);
});

socket.on('chargement historique', (messagesHistorique) => {
    messages.innerHTML = '';
    messagesHistorique.forEach((data) => ajouterMessageEcran(data));
});

// --- GESTION DU "EN TRAIN D'ÉCRIRE..." ---
let timeout;
input.addEventListener('input', () => {
    if (!currentUser) return;
    socket.emit('typing', { pseudo: currentUser.username, isTyping: true });
    
    clearTimeout(timeout);
    timeout = setTimeout(() => {
        socket.emit('typing', { pseudo: currentUser.username, isTyping: false });
    }, 1500);
});

socket.on('typing', (data) => {
    if (data.isTyping) {
        typingIndicator.textContent = `${data.pseudo} est en train d'écrire...`;
    } else {
        typingIndicator.textContent = '';
    }
});