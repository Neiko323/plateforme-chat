const socket = io();

// UI DOM Elements
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
const rightSidebar = document.getElementById('right-sidebar');

const chatAttachBtn = document.getElementById('chat-attach-btn');
const chatFileInput = document.getElementById('chat-file-input');

// Profil Footer
const myAvatarWrapper = document.getElementById('my-avatar-wrapper');
const statusPickerMenu = document.getElementById('status-picker-menu');
const myStatusDot = document.getElementById('my-status-dot');
const mpCardAvatar = document.getElementById('mp-card-avatar');
const mpCardUsername = document.getElementById('mp-card-username');
const mpCardBio = document.getElementById('mp-card-bio');
const openSettingsBtn = document.getElementById('open-settings-btn');

// Mini Profile Card Card Popout
const userProfilePopout = document.getElementById('user-profile-popout');
const popoutImg = document.getElementById('popout-img');
const popoutName = document.getElementById('popout-name');
const popoutBioText = document.getElementById('popout-bio-text');
const popoutFriendActionBtn = document.getElementById('popout-friend-action-btn');
const popoutBlockBtn = document.getElementById('popout-block-btn');

// Paramètres Modale
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveProfileBtn = document.getElementById('save-profile-btn');
const logoutBtn = document.getElementById('logout-btn');
const deleteAccountBtn = document.getElementById('delete-account-btn');
const editAvatarFile = document.getElementById('edit-avatar-file');
const editAvatarPreview = document.getElementById('edit-avatar-preview');
const modalTabBtns = document.querySelectorAll('.modal-tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const blockedUsersList = document.getElementById('blocked-users-list');

// Onglets Vue Amis Centrale
const friendsTabBtn = document.getElementById('friends-tab-btn');
const chatViewContainer = document.getElementById('chat-view-container');
const friendsViewContainer = document.getElementById('friends-view-container');
const friendsCentralList = document.getElementById('friends-central-list');
const subtabAll = document.getElementById('subtab-all');
const subtabPending = document.getElementById('subtab-pending');
const pendingBadge = document.getElementById('pending-badge');

// App Global State
let isLoginMode = true;
let currentUser = null;
let currentChatTarget = { type: 'global', id: null };
let currentFriendsSubTab = 'all'; // 'all' ou 'pending'
let notificationsDMs = {};
let globalUnreadCount = 0;
let activeTab = 'tab-profile';
let selectedPopoutUserId = null;

// Stockage local des membres reçu par dispatch
let cacheRelationsAmis = []; // Stocke le dernier tableau brut reçu du serveur
let listeMembresGlobale = [];
let listeMembresAmis = [];

authSwitchText.onclick = () => {
    isLoginMode = !isLoginMode;
    if (isLoginMode) {
        authTitle.textContent = "Ha, vous revoilà !";
        authSubtitle.textContent = "Nous sommes si heureux de vous revoir !";
        authSubmitBtn.textContent = "Se connecter";
        authSwitchText.innerHTML = "Besoin d'un compte ? <span>S'inscrire</span>";
    } else {
        authTitle.textContent = "Créer un compte";
        authSubtitle.textContent = "Devenez membre de notre super espace !";
        authSubmitBtn.textContent = "S'inscrire";
        authSwitchText.innerHTML = "Déjà un compte ? <span>Se connecter</span>";
    }
};

authSubmitBtn.onclick = async () => {
    const username = authUsernameInput.value.trim();
    const password = authPasswordInput.value;
    if (!username || !password) return alert("Veuillez remplir tous les champs.");

    const url = isLoginMode ? '/api/auth/login' : '/api/auth/register';
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (res.ok) {
        if (isLoginMode) {
            currentUser = data;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            authScreen.style.display = 'none';
            mainApp.style.display = 'block';
            initialiserSession();
        } else {
            alert("Compte créé ! Connectez-vous désormais.");
            isLoginMode = true;
            authSwitchText.onclick();
        }
    } else { alert(data.error); }
};

function initialiserSession() {
    socket.emit('authentifier', currentUser.id);
    mpCardAvatar.src = currentUser.avatar_url || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';
    mpCardUsername.textContent = currentUser.username;
    mpCardBio.textContent = currentUser.bio || 'Aucune biographie...';
    myStatusDot.className = `status-dot ${currentUser.status_type || 'online'}`;
    changerSalonGlobal();
}

myAvatarWrapper.onclick = (e) => {
    e.stopPropagation();
    statusPickerMenu.style.display = statusPickerMenu.style.display === 'flex' ? 'none' : 'flex';
};

document.querySelectorAll('.status-option').forEach(opt => {
    opt.onclick = () => {
        const selectedStatus = opt.getAttribute('data-status');
        myStatusDot.className = `status-dot ${selectedStatus}`;
        socket.emit('changer statut', selectedStatus);
        statusPickerMenu.style.display = 'none';
    };
});

document.onclick = () => {
    statusPickerMenu.style.display = 'none';
    userProfilePopout.style.display = 'none';
};

function changerSalonGlobal() {
    chatViewContainer.style.display = 'flex';
    friendsViewContainer.style.display = 'none';

    currentChatTarget = { type: 'global', id: null };
    chatHeader.innerHTML = `# général <span>| Bienvenue sur le salon général !</span>`;
    document.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
    globalChannelBtn.classList.add('active');
    globalUnreadCount = 0;
    globalBadgeContainer.innerHTML = "";
    socket.emit('demande historique', currentChatTarget);
    rafraichirBarreDroite();
}

function changerSalonDM(user) {
    chatViewContainer.style.display = 'flex';
    friendsViewContainer.style.display = 'none';

    currentChatTarget = { type: 'dm', id: user.id };
    chatHeader.innerHTML = `👤 ${user.username} <span>| Message privé avec ${user.username}</span>`;
    document.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`dm-${user.id}`)?.classList.add('active');
    
    notificationsDMs[user.id] = 0;
    const badge = document.getElementById(`badge-${user.id}`);
    if (badge) badge.remove();
    
    socket.emit('demande historique', currentChatTarget);
    rafraichirBarreDroite();
}

friendsTabBtn.onclick = () => {
    document.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
    friendsTabBtn.classList.add('active');
    
    chatViewContainer.style.display = 'none';
    friendsViewContainer.style.display = 'flex';
    currentChatTarget = { type: 'friends', id: null };
    
    // Forcer le sous-onglet par défaut sur "Tous" au clic principal
    subtabAll.classList.add('active');
    subtabPending.classList.remove('active');
    currentFriendsSubTab = 'all';

    socket.emit('demande vue amis centrale');
    rafraichirBarreDroite();
};

// CORRECTION : Déclencheurs de sous-onglets avec nettoyage et reconstruction immédiate
subtabAll.onclick = () => {
    subtabAll.classList.add('active');
    subtabPending.classList.remove('active');
    currentFriendsSubTab = 'all';
    genererInterfaceCentraleAmis();
};

subtabPending.onclick = () => {
    subtabPending.classList.add('active');
    subtabAll.classList.remove('active');
    currentFriendsSubTab = 'pending';
    genererInterfaceCentraleAmis();
};

chatAttachBtn.onclick = () => chatFileInput.click();
chatFileInput.onchange = async () => {
    const file = chatFileInput.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('chatFile', file);
    const res = await fetch('/api/chat/upload', { method: 'POST', body: formData });
    if (res.ok) {
        const data = await res.json();
        socket.emit('chat message', { texte: `Fichier partagé : ${file.name}`, target: currentChatTarget, fileUrl: data.fileUrl, fileType: data.fileType });
    } else { alert("Erreur d'envoi du fichier."); }
    chatFileInput.value = "";
};

form.onsubmit = (e) => {
    e.preventDefault();
    const texte = input.value.trim();
    if (!texte) return;
    socket.emit('chat message', { texte, target: currentChatTarget });
    input.value = '';
};

window.ouvrirProfilPopout = (e, userId) => {
    e.stopPropagation();
    userProfilePopout.style.top = `${Math.min(e.clientY, window.innerHeight - 260)}px`;
    userProfilePopout.style.left = `${Math.min(e.clientX, window.innerWidth - 300)}px`;
    userProfilePopout.style.display = 'block';

    socket.emit('demande info profil', userId);
};

socket.on('info profil', (member) => {
    if (!member) return;
    selectedPopoutUserId = member.id;
    popoutImg.src = member.avatar_url || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';
    popoutName.textContent = member.username;
    popoutBioText.textContent = member.bio || "Aucune biographie communiquée.";

    if (member.id === currentUser.id) {
        popoutFriendActionBtn.style.display = 'none';
        popoutBlockBtn.style.display = 'none';
    } else {
        popoutFriendActionBtn.style.display = 'block';
        popoutBlockBtn.style.display = 'block';
        socket.emit('recuperer relation ami', member.id);
    }
});

popoutFriendActionBtn.onclick = (e) => {
    e.stopPropagation();
    const currentState = popoutFriendActionBtn.getAttribute('data-state');
    if (!currentState || currentState === 'none') {
        socket.emit('action ami', { action: 'demande', targetId: selectedPopoutUserId });
    } else if (currentState === 'received') {
        socket.emit('action ami', { action: 'accepter', targetId: selectedPopoutUserId });
    } else if (currentState === 'sent' || currentState === 'accepted') {
        socket.emit('action ami', { action: 'supprimer', targetId: selectedPopoutUserId });
    }
};

popoutBlockBtn.onclick = (e) => {
    e.stopPropagation();
    const isBlocked = popoutBlockBtn.getAttribute('data-blocked') === 'true';
    if(isBlocked) {
        socket.emit('action ami', { action: 'debloquer', targetId: selectedPopoutUserId });
    } else {
        if(confirm("Voulez-vous vraiment bloquer cet utilisateur ?")) {
            socket.emit('action ami', { action: 'bloquer', targetId: selectedPopoutUserId });
        }
    }
};

socket.on('statut relation ami', ({ targetId, relation }) => {
    if (selectedPopoutUserId !== targetId) return;
    
    if (!relation) {
        popoutFriendActionBtn.textContent = "Ajouter en ami";
        popoutFriendActionBtn.className = "popout-btn";
        popoutFriendActionBtn.setAttribute('data-state', 'none');
        popoutBlockBtn.textContent = "Bloquer l'utilisateur";
        popoutBlockBtn.setAttribute('data-blocked', 'false');
        popoutFriendActionBtn.style.display = 'block';
    } else if (relation.status === 'blocked') {
        popoutFriendActionBtn.style.display = 'none';
        popoutBlockBtn.textContent = "Débloquer l'utilisateur";
        popoutBlockBtn.setAttribute('data-blocked', 'true');
    } else {
        popoutBlockBtn.textContent = "Bloquer l'utilisateur";
        popoutBlockBtn.setAttribute('data-blocked', 'false');
        popoutFriendActionBtn.style.display = 'block';

        if (relation.status === 'pending') {
            if (relation.action_user_id === currentUser.id) {
                popoutFriendActionBtn.textContent = "Annuler la demande";
                popoutFriendActionBtn.className = "popout-btn btn-remove";
                popoutFriendActionBtn.setAttribute('data-state', 'sent');
            } else {
                popoutFriendActionBtn.textContent = "Accepter l'invitation";
                popoutFriendActionBtn.className = "popout-btn";
                popoutFriendActionBtn.setAttribute('data-state', 'received');
            }
        } else if (relation.status === 'accepted') {
            popoutFriendActionBtn.textContent = "Retirer des amis";
            popoutFriendActionBtn.className = "popout-btn btn-remove";
            popoutFriendActionBtn.setAttribute('data-state', 'accepted');
        }
    }
});

function ajouterMessageEcran(data) {
    const isOwner = data.senderId === currentUser.id;
    const item = document.createElement('li');
    item.className = "message-container";
    item.id = `msg-${data.id}`;

    let mediaHTML = "";
    if (data.fileUrl) {
        if (data.fileType && data.fileType.startsWith('image/')) {
            mediaHTML = `<br><img src="${data.fileUrl}" class="chat-media" alt="">`;
        } else {
            mediaHTML = `<br><a href="${data.fileUrl}" download class="file-download-link">📥 Télécharger le fichier</a>`;
        }
    }

    item.innerHTML = `
        <img class="avatar-chat" src="${data.avatar}" onclick="ouvrirProfilPopout(event, ${data.senderId})" alt="">
        <div class="msg-content">
            <span class="pseudo" onclick="ouvrirProfilPopout(event, ${data.senderId})">${data.pseudo}</span>
            <div class="texte-message" id="text-${data.id}">${data.texte}</div>
            ${mediaHTML}
        </div>
        ${isOwner ? `
        <div class="message-actions">
            <button class="action-btn" onclick="editerMessage(${data.id})" title="Modifier">✏️</button>
            <button class="action-btn" onclick="socket.emit('supprimer message', ${data.id})" title="Supprimer">🗑️</button>
        </div>` : ''}
    `;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
}

window.editerMessage = (msgId) => {
    const texteElement = document.getElementById(`text-${msgId}`);
    const nouveauTexte = prompt("Modifier le message :", texteElement.textContent);
    if (nouveauTexte !== null && nouveauTexte.trim() !== "") {
        socket.emit('editer message', { msgId, nouveauTexte });
    }
};

socket.on('chargement historique', (history) => {
    messages.innerHTML = '';
    history.forEach(m => ajouterMessageEcran(m));
});

socket.on('chat message', (data) => {
    const correspondAuSalonActuel = (currentChatTarget.type === 'global' && data.isGlobal) || 
        (currentChatTarget.type === 'dm' && !data.isGlobal && (data.senderId === currentChatTarget.id || (data.senderId === currentUser.id && data.receiverId === currentChatTarget.id)));

    if (correspondAuSalonActuel) {
        socket.emit('demande historique', currentChatTarget);
    } else {
        if (data.isGlobal) {
            globalUnreadCount++;
            globalBadgeContainer.innerHTML = `<span class="unread-badge">${globalUnreadCount}</span>`;
        } else {
            const expediteurId = data.senderId;
            notificationsDMs[expediteurId] = (notificationsDMs[expediteurId] || 0) + 1;
            const itemDm = document.getElementById(`dm-${expediteurId}`);
            if (itemDm) {
                let badge = document.getElementById(`badge-${expediteurId}`);
                if (!badge) {
                    badge = document.createElement('div');
                    badge.id = `badge-${expediteurId}`;
                    badge.className = "unread-badge";
                    itemDm.appendChild(badge);
                }
                badge.textContent = notificationsDMs[expediteurId];
            }
        }
    }
});

socket.on('message supprime', (id) => { document.getElementById(`msg-${id}`)?.remove(); });
socket.on('message edite', (data) => {
    const textEl = document.getElementById(`text-${data.msgId}`);
    if (textEl) textEl.textContent = data.nouveauTexte;
});

socket.on('liste dms', (users) => {
    dmsList.innerHTML = '';
    users.forEach(u => {
        const btn = document.createElement('div');
        btn.className = "channel-btn";
        btn.id = `dm-${u.id}`;
        btn.innerHTML = `<img src="${u.avatar_url}" alt=""> <span>${u.username}</span>`;
        btn.onclick = () => changerSalonDM(u);
        dmsList.appendChild(btn);
    });
    if (currentChatTarget.type === 'dm' && !users.some(u => u.id === currentChatTarget.id)) {
        changerSalonGlobal();
    }
});

socket.on('listes membres dispatch', (data) => {
    listeMembresGlobale = data.globale;
    listeMembresAmis = data.amis;
    rafraichirBarreDroite();
});

function rafraichirBarreDroite() {
    rightSidebar.innerHTML = '';
    
    const estDansOngletAmis = (currentChatTarget.type === 'friends');
    const listeAAfficher = estDansOngletAmis ? listeMembresAmis : listeMembresGlobale;

    if (!estDansOngletAmis && currentUser) {
        const monProfilRow = document.createElement('div');
        monProfilRow.className = `member-row online-user`;
        monProfilRow.onclick = (e) => ouvrirProfilPopout(e, currentUser.id);
        monProfilRow.innerHTML = `
            <div class="member-avatar-box">
                <img src="${currentUser.avatar_url || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}" alt="">
                <div class="status-dot ${currentUser.status_type || 'online'}"></div>
            </div> 
            <span class="member-name">${currentUser.username} <span style="font-size:0.75rem; color:#949ba4;">(Moi)</span></span>
        `;
        rightSidebar.appendChild(monProfilRow);
    }

    listeAAfficher.forEach(m => {
        const row = document.createElement('div');
        row.className = `member-row ${m.enLigne ? 'online-user' : ''}`;
        row.onclick = (e) => ouvrirProfilPopout(e, m.id);
        row.innerHTML = `
            <div class="member-avatar-box">
                <img src="${m.avatar_url}" alt="">
                <div class="status-dot ${m.enLigne ? m.status_type : 'offline'}"></div>
            </div> 
            <span class="member-name">${m.username}</span>
        `;
        rightSidebar.appendChild(row);
    });
}

// Intercepteur Socket : Reçoit les données brutes et déclenche la construction
socket.on('liste vue amis centrale', (relations) => {
    cacheRelationsAmis = relations; // Mise en mémoire tampon pour les switchs d'onglets instantanés
    genererInterfaceCentraleAmis();
});

// CORRECTION : Fonction isolée chargée de filtrer de façon stricte et d'injecter dans le DOM
function genererInterfaceCentraleAmis() {
    friendsCentralList.innerHTML = '';
    
    // 1. Calculer le badge rouge global des invitations reçues (non validées)
    const requetesEnAttenteRecues = cacheRelationsAmis.filter(r => r.status === 'pending' && r.action_user_id !== currentUser.id);
    if (requetesEnAttenteRecues.length > 0) {
        pendingBadge.textContent = requetesEnAttenteRecues.length;
        pendingBadge.style.display = 'inline-flex';
    } else { 
        pendingBadge.style.display = 'none'; 
    }

    // 2. Filtrer le tableau selon le sous-onglet actif ('all' pour les validés, 'pending' pour les requêtes en cours)
    let listeAffichage = [];
    if (currentFriendsSubTab === 'all') {
        listeAffichage = cacheRelationsAmis.filter(r => r.status === 'accepted');
    } else if (currentFriendsSubTab === 'pending') {
        listeAffichage = cacheRelationsAmis.filter(r => r.status === 'pending');
    }

    // 3. Rendu si aucun résultat
    if (listeAffichage.length === 0) {
        friendsCentralList.innerHTML = `<p style="color:#6d737d; font-size:0.9rem; text-align:center; margin-top:30px;">Il n'y a personne ici.</p>`;
        return;
    }

    // 4. Boucler et générer les lignes HTML adaptées
    listeAffichage.forEach(r => {
        const row = document.createElement('div');
        row.className = "blocked-user-row";
        
        let actionsHTML = '';
        if (r.status === 'accepted') {
            actionsHTML = `<button class="unblock-btn" style="border-color:#5865f2; color:#5865f2;" onclick="changerSalonDM({id:${r.u_id}, username:'${r.username}', avatar_url:'${r.avatar_url}'})">💬 Message</button>`;
        } else {
            // Statut strict 'pending' (En attente)
            if (r.action_user_id === currentUser.id) {
                // Envoyée par nous
                actionsHTML = `
                    <span style="color:#949ba4; font-size:0.85rem; margin-right:10px;">Demande envoyée...</span>
                    <button class="unblock-btn" onclick="actionAmiCentrale('refuser', ${r.u_id})">Annuler</button>
                `;
            } else {
                // Reçue d'un tiers
                actionsHTML = `
                    <button class="save-btn" style="padding:4px 10px; font-size:0.8rem; margin-right:5px; background-color:#248046;" onclick="actionAmiCentrale('accepter', ${r.u_id})">Accepter</button>
                    <button class="unblock-btn" onclick="actionAmiCentrale('refuser', ${r.u_id})">Refuser</button>
                `;
            }
        }

        row.innerHTML = `
            <div class="blocked-user-info">
                <img src="${r.avatar_url || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}">
                <div>
                    <div style="font-weight:bold; color:white;">${r.username}</div>
                    <div style="font-size:0.75rem; color:#949ba4;">
                        ${r.status === 'accepted' ? 'Ami' : (r.action_user_id === currentUser.id ? 'Demande d\'ami envoyée' : 'Demande d\'ami reçue')}
                    </div>
                </div>
            </div>
            <div>${actionsHTML}</div>
        `;
        friendsCentralList.appendChild(row);
    });
}

window.actionAmiCentrale = (action, targetId) => {
    socket.emit('action ami', { action, targetId });
    // On redemande immédiatement une mise à jour après l'action
    setTimeout(() => { socket.emit('demande vue amis centrale'); }, 50);
};

socket.on('liste bloques', (users) => {
    blockedUsersList.innerHTML = '';
    if(users.length === 0) {
        blockedUsersList.innerHTML = `<p style="color:#6d737d; font-size:0.9rem;">Aucun utilisateur bloqué.</p>`;
        return;
    }
    users.forEach(u => {
        const row = document.createElement('div');
        row.className = "blocked-user-row";
        row.innerHTML = `
            <div class="blocked-user-info">
                <img src="${u.avatar_url}" alt="">
                <span style="font-weight:bold; color:white;">${u.username}</span>
            </div>
            <button class="unblock-btn" onclick="debloquerUtilisateur(${u.id})">Débloquer</button>
        `;
        blockedUsersList.appendChild(row);
    });
});

window.debloquerUtilisateur = (id) => {
    socket.emit('action ami', { action: 'debloquer', targetId: id });
    setTimeout(() => socket.emit('demande liste bloques'), 100);
};

globalChannelBtn.onclick = changerSalonGlobal;

openSettingsBtn.onclick = (e) => {
    e.stopPropagation();
    editAvatarPreview.src = currentUser.avatar_url || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';
    document.getElementById('edit-bio').value = currentUser.bio || '';
    document.getElementById('edit-username').value = currentUser.username;
    document.getElementById('edit-new-password').value = "";
    document.getElementById('edit-current-password').value = "";
    
    modalTabBtns[0].click();
    settingsModal.style.display = 'flex';
};

closeSettingsBtn.onclick = () => settingsModal.style.display = 'none';

modalTabBtns.forEach(btn => {
    btn.onclick = () => {
        modalTabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        activeTab = btn.getAttribute('data-tab');
        document.getElementById(activeTab).classList.add('active');

        if(activeTab === 'tab-blocked') {
            socket.emit('demande liste bloques');
        }
    };
});

editAvatarFile.onchange = () => {
    const file = editAvatarFile.files[0];
    if (file) editAvatarPreview.src = URL.createObjectURL(file);
};

logoutBtn.onclick = () => { localStorage.clear(); location.reload(); };

deleteAccountBtn.onclick = async () => {
    const pass = prompt("Confirmez votre mot de passe pour supprimer définitivement le compte :");
    if (pass) {
        const res = await fetch('/api/profile/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, password: pass })
        });
        if (res.ok) { localStorage.clear(); location.reload(); } else { const err = await res.json(); alert(err.error); }
    }
};

saveProfileBtn.onclick = async () => {
    if(activeTab === 'tab-blocked') { settingsModal.style.display = 'none'; return; }

    const formData = new FormData(); 
    formData.append('userId', currentUser.id); 
    formData.append('activeTab', activeTab);
    
    if (activeTab === 'tab-profile') {
        formData.append('bio', document.getElementById('edit-bio').value);
        if (editAvatarFile.files[0]) formData.append('avatarFile', editAvatarFile.files[0]);
    } else {
        formData.append('username', document.getElementById('edit-username').value);
        formData.append('currentPassword', document.getElementById('edit-current-password').value); 
        formData.append('newPassword', document.getElementById('edit-new-password').value);
    }
    
    const res = await fetch('/api/profile/update', { method: 'POST', body: formData }); 
    const d = await res.json();
    
    if (res.ok) { 
        currentUser = d.user; 
        localStorage.setItem('currentUser', JSON.stringify(currentUser)); 
        initialiserSession(); 
        settingsModal.style.display = 'none'; 
    } else { alert(d.error); }
};

const savedUser = localStorage.getItem('currentUser');
if (savedUser && savedUser !== "undefined" && savedUser !== "null") {
    currentUser = JSON.parse(savedUser); 
    authScreen.style.display = 'none'; 
    mainApp.style.display = 'block'; 
    initialiserSession();
}