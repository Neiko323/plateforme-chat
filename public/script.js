const socket = io();

// DOM Authentification
const authScreen = document.getElementById('auth-screen');
const mainApp = document.getElementById('main-app');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const authUsernameInput = document.getElementById('auth-username');
const authPasswordInput = document.getElementById('auth-password');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authSwitchText = document.getElementById('auth-switch-text');

// DOM Chat
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const typingIndicator = document.getElementById('typing-indicator');

// DOM Éléments Pied de page Gauche
const footerUserAvatar = document.getElementById('footer-user-avatar');
const footerUserUsername = document.getElementById('footer-user-username');

// DOM Éléments Fenêtre Modale Paramètres
const settingsModal = document.getElementById('settings-modal');
const openSettingsBtn = document.getElementById('open-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveProfileBtn = document.getElementById('save-profile-btn');
const logoutBtn = document.getElementById('logout-btn');

// DOM Onglets Modale
const tabButtons = document.querySelectorAll('.modal-tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const modalTabTitle = document.getElementById('modal-tab-title');

// DOM Formulaire Paramètres
const editAvatarFile = document.getElementById('edit-avatar-file');
const editUsernameInput = document.getElementById('edit-username');
const editBioInput = document.getElementById('edit-bio');
const editNewPasswordInput = document.getElementById('edit-new-password');
const editCurrentPasswordInput = document.getElementById('edit-current-password');

let isLoginMode = true; 
let currentUser = null;
let activeTab = 'tab-profile'; // Permet de savoir quel onglet est ouvert

// 🛠️ LOGIQUE DE NAVIGATION DANS LES ONGLETS
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        // Enlever la classe active de tous les boutons et contenus
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));

        // Activer l'onglet cliqué
        button.classList.add('active');
        activeTab = button.getAttribute('data-target');
        document.getElementById(activeTab).classList.add('active');

        // Changer le titre de la modale pour faire propre
        modalTabTitle.textContent = activeTab === 'tab-profile' ? 'Profil utilisateur' : 'Sécurité du compte';
    });
});

function rafraichirInterfaceUtilisateur() {
    if (!currentUser) return;
    footerUserUsername.textContent = currentUser.username;
    footerUserAvatar.src = currentUser.avatar;

    editUsernameInput.value = currentUser.username;
    editBioInput.value = currentUser.bio || '';
    editNewPasswordInput.value = '';
    editCurrentPasswordInput.value = '';
    editAvatarFile.value = '';
}

openSettingsBtn.addEventListener('click', () => { settingsModal.style.display = 'flex'; });
closeSettingsBtn.addEventListener('click', () => { settingsModal.style.display = 'none'; });

// Session au démarrage
const savedUser = localStorage.getItem('currentUser');
if (savedUser && savedUser !== "undefined" && savedUser !== "null") {
    currentUser = JSON.parse(savedUser);
    authScreen.style.display = 'none';
    mainApp.style.display = 'block';
    rafraichirInterfaceUtilisateur();
    socket.emit('demande historique');
} else {
    authScreen.style.display = 'block';
    mainApp.style.display = 'none';
}

function lierLienBascule() {
    const link = document.getElementById('link-to-register') || document.getElementById('link-to-login');
    if (link) {
        link.onclick = (e) => {
            e.preventDefault();
            isLoginMode = !isLoginMode;
            if (isLoginMode) {
                authTitle.textContent = "Ha, te revoilà !";
                authSubmitBtn.textContent = "Se connecter";
                authSwitchText.innerHTML = `Besoin d'un compte ? <a id="link-to-register">S'inscrire</a>`;
            } else {
                authTitle.textContent = "Créer un compte";
                authSubmitBtn.textContent = "S'inscrire";
                authSwitchText.innerHTML = `Tu as déjà un compte ? <a id="link-to-login">Se connecter</a>`;
            }
            lierLienBascule();
        };
    }
}
lierLienBascule();

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
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            authScreen.style.display = 'none';
            mainApp.style.display = 'block';
            rafraichirInterfaceUtilisateur();
            socket.emit('demande historique');
        }
    } catch (err) { alert("Erreur serveur."); }
});

// Enregistrer les modifications selon l'onglet actif
saveProfileBtn.addEventListener('click', async () => {
    if (!currentUser) return;

    const formData = new FormData();
    formData.append('userId', currentUser.id);
    formData.append('activeTab', activeTab); // 🛠️ On indique au serveur l'onglet utilisé

    if (activeTab === 'tab-profile') {
        // Envoi pour l'onglet profil (sans MDP)
        formData.append('bio', editBioInput.value.trim());
        if (editAvatarFile.files[0]) {
            formData.append('avatarFile', editAvatarFile.files[0]);
        }
    } else if (activeTab === 'tab-account') {
        // Envoi pour l'onglet compte (avec vérification de sécurité)
        formData.append('username', editUsernameInput.value.trim());
        formData.append('currentPassword', editCurrentPasswordInput.value);
        formData.append('newPassword', editNewPasswordInput.value);
    }

    try {
        const response = await fetch('/api/profile/update', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (response.ok) {
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            rafraichirInterfaceUtilisateur();
            settingsModal.style.display = 'none'; 
            alert("Modifications enregistrées !");
            socket.emit('demande historique');
        } else {
            alert(data.error);
        }
    } catch (err) { alert("Erreur lors de la modification."); }
});

logoutBtn.addEventListener('click', () => { localStorage.clear(); location.reload(); });

// --- LOGIQUE CHAT ---
function ajouterMessageEcran(data) {
    const item = document.createElement('li');
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
    
    if (messageTexte && currentUser && currentUser.id) {
        socket.emit('chat message', { 
            userId: currentUser.id,
            pseudo: currentUser.username, 
            texte: messageTexte,
            avatar: currentUser.avatar 
        });
        input.value = ''; 
        socket.emit('typing', { pseudo: currentUser.username, isTyping: false });
    }
});

socket.on('chat message', (data) => { ajouterMessageEcran(data); });

socket.on('chargement historique', (messagesHistorique) => {
    messages.innerHTML = ''; 
    messagesHistorique.forEach((data) => ajouterMessageEcran(data));
});

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
    typingIndicator.textContent = data.isTyping ? `${data.pseudo} est en train d'écrire...` : '';
});