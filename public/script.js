const socket = io();

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const typingIndicator = document.getElementById('typing-indicator');

// 1. Demander le pseudo au chargement de la page
let pseudo = prompt("Choisis ton pseudo pour le salon :") || "Anonyme";

// Fonction utilitaire pour ajouter visuellement un message dans la liste
function afficherMessage(data) {
    const item = document.createElement('li');
    
    const pseudoSpan = document.createElement('span');
    pseudoSpan.classList.add('pseudo-msg');
    pseudoSpan.textContent = data.pseudo;

    const texteSpan = document.createElement('span');
    texteSpan.classList.add('text-msg');
    texteSpan.textContent = data.texte;

    item.appendChild(pseudoSpan);
    item.appendChild(texteSpan);
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
}

// Envoi d'un message
form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value) {
        // On envoie un objet complet au serveur
        socket.emit('chat message', { pseudo: pseudo, texte: input.value });
        input.value = '';
        // On prévient le serveur qu'on a fini d'écrire
        socket.emit('typing', { pseudo: pseudo, isTyping: false });
    }
});

// Réception d'un message isolé
socket.on('chat message', (data) => {
    afficherMessage(data);
});

// Réception de l'historique complet
socket.on('chargement historique', (messagesHistorique) => {
    messages.innerHTML = '';
    messagesHistorique.forEach((data) => afficherMessage(data));
});

// --- Gestion du "En train d'écrire..." ---
let timeout;

input.addEventListener('input', () => {
    // On prévient le serveur qu'on écrit
    socket.emit('typing', { pseudo: pseudo, isTyping: true });
    
    // Si l'utilisateur arrête de taper pendant 1.5s, on retire l'indicateur
    clearTimeout(timeout);
    timeout = setTimeout(() => {
        socket.emit('typing', { pseudo: pseudo, isTyping: false });
    }, 1500);
});

// Écouter les autres utilisateurs qui écrivent
socket.on('typing', (data) => {
    if (data.isTyping) {
        typingIndicator.textContent = `${data.pseudo} est en train d'écrire...`;
    } else {
        typingIndicator.textContent = '';
    }
});