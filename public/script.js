const socket = io();

// DOM Éléments
const authScreen = document.getElementById('auth-screen');
const mainApp = document.getElementById('main-app');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const authUsernameInput = document.getElementById('auth-username');
const authPasswordInput = document.getElementById('auth-password');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authSwitchText = document.getElementById('auth-switch-text');

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const chatHeader = document.getElementById('chat-header');
const dmsList = document.getElementById('dms-list');
const globalChannelBtn = document.getElementById('global-channel-btn');
const globalBadgeContainer = document.getElementById('global-badge-container');
const typingIndicator = document.getElementById('typing-indicator');
const rightSidebar = document.getElementById('right-sidebar');

// Éléments Pièce Jointe Chat
const chatAttachBtn = document.getElementById('chat-attach-btn');
const chatFileInput = document.getElementById('chat-file-input');

const miniProfileCard = document.getElementById('mini-profile-card');
const mpCardAvatar = document.getElementById('mp-card-avatar');
const mpCardUsername = document.getElementById('mp-card-username');
const mpCardBio = document.getElementById('mp-card-bio');
const mpCardActions = document.getElementById('mp-card-actions');

const settingsModal = document.getElementById('settings-modal');
const openSettingsBtn = document.getElementById('open-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveProfileBtn = document.getElementById('save-profile-btn');
const logoutBtn = document.getElementById('logout-btn');
const deleteAccountBtn = document.getElementById('delete-account-btn');
const footerUserAvatar = document.getElementById('footer-user-avatar');
const footerUserUsername = document.getElementById('footer-user-username');
const footerStatusDot = document.getElementById('footer-status-dot');
const statusPickerMenu = document.getElementById('status-picker-menu');

let isLoginMode = true; 
let currentUser = null;
let currentChatTarget = { type: 'global', id: null, name: 'général' }; 
let activeTab = 'tab-profile';
let compteursNonLus = { global: 0 }; 
let statutActuel = localStorage.getItem('userStatus') || 'online';

function basculerSurGeneral() {
    document.querySelectorAll('.clickable-item').forEach(i => i.classList.remove('active'));
    globalChannelBtn.classList.add('active');
    globalChannelBtn.classList.remove('unread');
    compteursNonLus.global = 0;
    globalBadgeContainer.innerHTML = '';
    currentChatTarget = { type: 'global', id: null, name: 'général' };
    chatHeader.textContent = "💬 # général";
    socket.emit('demande historique', currentChatTarget);
    socket.emit('demande liste membres', currentChatTarget);
}

globalChannelBtn.addEventListener('click', basculerSurGeneral);

function ouvrirDiscussionPrivee(friend) {
    document.querySelectorAll('.clickable-item').forEach(i => i.classList.remove('active'));
    let dmItem = document.getElementById(`dm-${friend.id}`);
    if (dmItem) {
        dmItem.classList.add('active');
        dmItem.classList.remove('unread');
        const badge = document.getElementById(`badge-${friend.id}`);
        if(badge) badge.remove();
    }
    compteursNonLus[friend.id] = 0;
    currentChatTarget = { type: 'dm', id: friend.id, name: friend.username };
    chatHeader.textContent = `🔒 MP avec @${friend.username}`;
    socket.emit('demande historique', currentChatTarget);
    socket.emit('demande liste membres', currentChatTarget);
}

document.getElementById('footer-profile-click').addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.classList.contains('footer-avatar') || e.target.id === 'footer-status-dot') {
        statusPickerMenu.style.display = statusPickerMenu.style.display === 'block' ? 'none' : 'block';
        miniProfileCard.style.display = 'none';
    } else {
        if(currentUser) {
            socket.emit('demande infos profil', currentUser.id);
            socket.once('reponse infos profil', (userProfile) => { ouvrirMiniProfil(userProfile, e); });
        }
        statusPickerMenu.style.display = 'none';
    }
});

document.querySelectorAll('.status-option').forEach(opt => {
    opt.addEventListener('click', () => {
        const newStatus = opt.getAttribute('data-status');
        statutActuel = newStatus;
        localStorage.setItem('userStatus', newStatus);
        footerStatusDot.className = `status-dot status-${newStatus}`;
        socket.emit('changement statut', newStatus);
        statusPickerMenu.style.display = 'none';
    });
});

document.addEventListener('click', (e) => {
    if (!miniProfileCard.contains(e.target) && !e.target.classList.contains('avatar-chat') && !e.target.classList.contains('pseudo') && !e.target.closest('#footer-profile-click') && !e.target.closest('.member-item')) {
        miniProfileCard.style.display = 'none';
    }
    if (!statusPickerMenu.contains(e.target)) {
        statusPickerMenu.style.display = 'none';
    }
});

function ouvrirMiniProfil(targetUser, mouseEvent) {
    mpCardAvatar.src = targetUser.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${targetUser.username}`;
    mpCardUsername.textContent = targetUser.username;
    mpCardBio.textContent = targetUser.bio || "Pas de biographie pour le moment.";
    mpCardActions.innerHTML = '';
    
    if (currentUser && targetUser.id !== currentUser.id) {
        if (targetUser.isFriend) {
            const mpBtn = document.createElement('button');
            mpBtn.className = "profile-action-btn btn-primary";
            mpBtn.textContent = "Message Privé";
            mpBtn.onclick = () => { ouvrirDiscussionPrivee(targetUser); miniProfileCard.style.display = 'none'; };
            mpCardActions.appendChild(mpBtn);
        } else if (targetUser.hasSentRequest) {
            const acceptBtn = document.createElement('button');
            acceptBtn.className = "profile-action-btn btn-primary";
            acceptBtn.textContent = "Accepter l'invitation";
            acceptBtn.onclick = () => { socket.emit('action ami', { action: 'accept', targetId: targetUser.id }); miniProfileCard.style.display = 'none'; };
            mpCardActions.appendChild(acceptBtn);
        } else if (targetUser.hasReceivedRequest) {
            const pendingBtn = document.createElement('button');
            pendingBtn.className = "profile-action-btn btn-secondary";
            pendingBtn.textContent = "Demande en attente...";
            pendingBtn.disabled = true;
            mpCardActions.appendChild(pendingBtn);
        } else {
            const addBtn = document.createElement('button');
            addBtn.className = "profile-action-btn btn-primary";
            addBtn.textContent = "Ajouter en ami";
            addBtn.onclick = () => { socket.emit('action ami', { action: 'request', targetId: targetUser.id }); miniProfileCard.style.display = 'none'; };
            mpCardActions.appendChild(addBtn);
        }
    }
    miniProfileCard.style.display = 'block';
    let top = mouseEvent.clientY;
    let left = mouseEvent.clientX + 15;
    if (top + miniProfileCard.offsetHeight > window.innerHeight) top = window.innerHeight - miniProfileCard.offsetHeight - 15;
    if (left + miniProfileCard.offsetWidth > window.innerWidth) left = mouseEvent.clientX - miniProfileCard.offsetWidth - 15;
    miniProfileCard.style.top = `${top}px`;
    miniProfileCard.style.left = `${left}px`;
}

function initialiserSession() {
    socket.emit('authentification-socket', currentUser.id);
    socket.emit('changement statut', statutActuel);
    footerStatusDot.className = `status-dot status-${statutActuel}`;

    rafraichirInterfaceUtilisateur();
    socket.emit('demande historique', currentChatTarget);
    socket.emit('demande liste amis');
    socket.emit('demande liste membres', currentChatTarget);
}

socket.on('mise a jour amis', (amisData) => {
    dmsList.innerHTML = '';
    amisData.forEach(friend => {
        if (!compteursNonLus[friend.id]) compteursNonLus[friend.id] = 0;
        const li = document.createElement('li');
        li.className = "clickable-item";
        li.id = `dm-${friend.id}`;
        
        if(currentChatTarget.type === 'dm' && currentChatTarget.id === friend.id) {
            li.classList.add('active');
        }

        li.innerHTML = `
            <div class="item-content">
                <img class="sidebar-avatar" src="${friend.avatar_url}" alt="">
                <span class="friend-name-text">${friend.username}</span>
            </div>
            <div id="badge-container-${friend.id}"></div>
        `;
        li.onclick = () => ouvrirDiscussionPrivee(friend);
        dmsList.appendChild(li);
        
        if(compteursNonLus[friend.id] > 0 && currentChatTarget.id !== friend.id) {
            li.classList.add('unread');
            document.getElementById(`badge-container-${friend.id}`).innerHTML = `<span class="badge-notification" id="badge-${friend.id}">${compteursNonLus[friend.id]}</span>`;
        }
    });
});

socket.on('compte supprime distant', (deletedUserId) => {
    if(currentChatTarget.type === 'dm' && currentChatTarget.id === parseInt(deletedUserId)) {
        basculerSurGeneral();
    }
    socket.emit('demande liste amis');
    socket.emit('demande liste membres', currentChatTarget);
});

socket.on('mise a jour membres', (membres) => {
    rightSidebar.innerHTML = '';
    const enLigne = membres.filter(m => m.statut && m.statut !== 'offline');
    const horsLigne = membres.filter(m => !m.statut || m.statut === 'offline');

    const genererGroupeHTML = (titre, liste) => {
        if (liste.length === 0) return;
        const titleDiv = document.createElement('div');
        titleDiv.className = 'member-group-title';
        titleDiv.textContent = `${titre} — ${liste.length}`;
        rightSidebar.appendChild(titleDiv);

        liste.forEach(m => {
            const item = document.createElement('div');
            const statusClass = m.statut || 'offline';
            item.className = `member-item ${statusClass === 'offline' ? 'member-offline' : ''}`;
            
            let statutTexte = 'Hors ligne';
            if (statusClass === 'online') statutTexte = 'En ligne';
            if (statusClass === 'idle') statutTexte = 'Absent';
            if (statusClass === 'dnd') statutTexte = 'Ne pas déranger';

            item.innerHTML = `
                <div class="avatar-container">
                    <img class="member-avatar" src="${m.avatar_url}" alt="">
                    <div class="status-dot status-${statusClass}"></div>
                </div>
                <div class="member-info">
                    <span class="member-name">${m.username}</span>
                    <span class="member-subtext">${statutTexte}</span>
                </div>
            `;
            item.onclick = (e) => {
                socket.emit('demande infos profil', m.id);
                socket.once('reponse infos profil', (userProfile) => { ouvrirMiniProfil(userProfile, e); });
            };
            rightSidebar.appendChild(item);
        });
    };
    genererGroupeHTML('Disponibles', enLigne);
    genererGroupeHTML('Hors ligne', horsLigne);
});

messages.addEventListener('click', (e) => {
    if (e.target.classList.contains('avatar-chat') || e.target.classList.contains('pseudo')) {
        const uId = e.target.getAttribute('data-uid');
        if (uId) {
            socket.emit('demande infos profil', uId);
            socket.once('reponse infos profil', (userProfile) => { ouvrirMiniProfil(userProfile, e); });
        }
    }
});

let typingTimeout;
input.addEventListener('input', () => {
    if (!currentUser) return;
    socket.emit('typing-start', { pseudo: currentUser.username, target: currentChatTarget });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => { socket.emit('typing-stop', { target: currentChatTarget }); }, 2000);
});

socket.on('typing-start', (data) => {
    if (currentChatTarget.type === 'global' && data.isGlobal) {
        typingIndicator.textContent = `${data.pseudo} est en train d'écrire...`;
    } else if (currentChatTarget.type === 'dm' && !data.isGlobal && data.senderId === currentChatTarget.id) {
        typingIndicator.textContent = `${data.pseudo} est en train d'écrire...`;
    }
});

socket.on('typing-stop', () => { typingIndicator.textContent = ''; });

// --- LOGIQUE D'ENVOI DE FICHIERS ---
chatAttachBtn.onclick = () => chatFileInput.click();

chatFileInput.onchange = async () => {
    const file = chatFileInput.files[0];
    if(!file || !currentUser) return;

    const formData = new FormData();
    formData.append('chatFile', file);

    try {
        const res = await fetch('/api/chat/upload', { method: 'POST', body: formData });
        if(res.ok) {
            const fileData = await res.json();
            // Envoyer le fichier au serveur via socket
            socket.emit('chat message', { 
                senderId: currentUser.id, 
                target: currentChatTarget, 
                texte: file.name,
                fileUrl: fileData.fileUrl,
                fileType: fileData.fileType
            });
        } else {
            alert("Erreur lors de l'envoi du fichier.");
        }
    } catch(err) {
        console.error(err);
    }
    chatFileInput.value = ''; // Reset l'input
};

form.addEventListener('submit', (e) => {
    e.preventDefault();
    const texte = input.value.trim();
    if (texte && currentUser) {
        socket.emit('chat message', { senderId: currentUser.id, target: currentChatTarget, texte: texte });
        socket.emit('typing-stop', { target: currentChatTarget });
        input.value = '';
    }
});

socket.on('chat message', (data) => {
    const estSurLeChatActuel = (currentChatTarget.type === 'global' && data.isGlobal) || 
                               (currentChatTarget.type === 'dm' && !data.isGlobal && (data.senderId === currentChatTarget.id || data.receiverId === currentChatTarget.id));
    if (estSurLeChatActuel) {
        ajouterMessageEcran(data);
    } else {
        if (data.isGlobal) {
            compteursNonLus.global++;
            globalChannelBtn.classList.add('unread');
            globalBadgeContainer.innerHTML = `<span class="badge-notification">${compteursNonLus.global}</span>`;
        } else {
            const expediteurId = data.senderId;
            compteursNonLus[expediteurId] = (compteursNonLus[expediteurId] || 0) + 1;
            const dmItem = document.getElementById(`dm-${expediteurId}`);
            if (dmItem) {
                dmItem.classList.add('unread');
                const container = document.getElementById(`badge-container-${expediteurId}`);
                if (container) container.innerHTML = `<span class="badge-notification" id="badge-${expediteurId}">${compteursNonLus[expediteurId]}</span>`;
            }
        }
    }
});

socket.on('chargement historique', (messagesHistorique) => {
    messages.innerHTML = '';
    typingIndicator.textContent = '';
    messagesHistorique.forEach(data => ajouterMessageEcran(data));
});

function ajouterMessageEcran(data) {
    const item = document.createElement('li');
    
    // Construction dynamique du corps du message s'il s'agit d'un média ou fichier
    let mediaHTML = `<span class="texte-message">${data.texte}</span>`;
    
    if (data.fileUrl) {
        if (data.fileType === 'image') {
            mediaHTML = `<span class="texte-message" style="font-size:0.85rem; color:#949ba4;">A envoyé une image :</span>
                         <img src="${data.fileUrl}" class="chat-image" alt="${data.texte}" onclick="window.open('${data.fileUrl}')">`;
        } else if (data.fileType === 'audio') {
            mediaHTML = `<span class="texte-message" style="font-size:0.85rem; color:#949ba4;">A envoyé un fichier audio (${data.texte}) :</span>
                         <audio src="${data.fileUrl}" controls class="chat-audio"></audio>`;
        } else {
            mediaHTML = `<a href="${data.fileUrl}" target="_blank" class="chat-file-link">📁 ${data.texte} (Télécharger)</a>`;
        }
    }

    item.innerHTML = `
        <img class="avatar-chat" data-uid="${data.senderId}" src="${data.avatar}" alt="">
        <div class="msg-content">
            <span class="pseudo" data-uid="${data.senderId}">${data.pseudo}</span>
            ${mediaHTML}
        </div>
    `;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
}

function lierLienBascule() {
    const linkToRegister = document.getElementById('link-to-register');
    const linkToLogin = document.getElementById('link-to-login');
    if (linkToRegister) {
        linkToRegister.onclick = (e) => {
            e.preventDefault(); isLoginMode = false;
            authTitle.textContent = "Créer un compte"; authSubtitle.textContent = "Inscris-toi pour commencer !";
            authSubmitBtn.textContent = "S'inscrire"; authSwitchText.innerHTML = `Tu as déjà un compte ? <a id="link-to-login">Se connecter</a>`;
            lierLienBascule();
        };
    }
    if (linkToLogin) {
        linkToLogin.onclick = (e) => {
            e.preventDefault(); isLoginMode = true;
            authTitle.textContent = "Ha, te revoilà !"; authSubtitle.textContent = "Nous sommes ravis de te revoir !";
            authSubmitBtn.textContent = "Se connecter"; authSwitchText.innerHTML = `Besoin d'un compte ? <a id="link-to-register">S'inscrire</a>`;
            lierLienBascule();
        };
    }
}

authSubmitBtn.addEventListener('click', async () => {
    const username = authUsernameInput.value.trim(); const password = authPasswordInput.value;
    if(!username || !password) return alert("Champs vides !");
    const endpoint = isLoginMode ? '/api/login' : '/api/register';
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const data = await response.json();
    if (response.ok) {
        currentUser = data.user; localStorage.setItem('currentUser', JSON.stringify(currentUser));
        authScreen.style.display = 'none'; mainApp.style.display = 'block'; initialiserSession();
    } else alert(data.error);
});

function rafraichirInterfaceUtilisateur() {
    if (!currentUser) return;
    footerUserUsername.textContent = currentUser.username;
    footerUserAvatar.src = currentUser.avatar;
    document.getElementById('edit-username').value = currentUser.username;
    document.getElementById('edit-bio').value = currentUser.bio || '';
}

document.querySelectorAll('.modal-tab-btn').forEach(b => {
    b.onclick = () => {
        document.querySelectorAll('.modal-tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        b.classList.add('active'); activeTab = b.getAttribute('data-target'); document.getElementById(activeTab).classList.add('active');
    };
});
openSettingsBtn.onclick = () => settingsModal.style.display = 'flex';
closeSettingsBtn.onclick = () => settingsModal.style.display = 'none';
logoutBtn.onclick = () => { socket.disconnect(); localStorage.clear(); location.reload(); };

deleteAccountBtn.onclick = async () => {
    if (confirm("⚠️ Êtes-vous sûr de vouloir supprimer définitivement votre compte ? Cette action est irréversible.")) {
        const res = await fetch('/api/profile/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        if (res.ok) {
            alert("Compte supprimé avec succès.");
            socket.disconnect();
            localStorage.clear();
            location.reload();
        } else {
            const err = await res.json();
            alert(err.error);
        }
    }
};

saveProfileBtn.onclick = async () => {
    const formData = new FormData(); formData.append('userId', currentUser.id); formData.append('activeTab', activeTab);
    if (activeTab === 'tab-profile') {
        formData.append('bio', document.getElementById('edit-bio').value);
        if (document.getElementById('edit-avatar-file').files[0]) formData.append('avatarFile', document.getElementById('edit-avatar-file').files[0]);
    } else {
        formData.append('username', document.getElementById('edit-username').value);
        formData.append('currentPassword', document.getElementById('edit-current-password').value); formData.append('newPassword', document.getElementById('edit-new-password').value);
    }
    const res = await fetch('/api/profile/update', { method: 'POST', body: formData }); const d = await res.json();
    if (res.ok) { currentUser = d.user; localStorage.setItem('currentUser', JSON.stringify(currentUser)); initialiserSession(); settingsModal.style.display = 'none'; } else alert(d.error);
};

const savedUser = localStorage.getItem('currentUser');
if (savedUser && savedUser !== "undefined" && savedUser !== "null") {
    currentUser = JSON.parse(savedUser); authScreen.style.display = 'none'; mainApp.style.display = 'block'; initialiserSession();
} else lierLienBascule();