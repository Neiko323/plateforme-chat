// Connexion au serveur Socket.io
const socket = io();

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');

// Événement lors de la soumission du formulaire (bouton Envoyer ou touche Entrée)
form.addEventListener('submit', (e) => {
    e.preventDefault(); // Empêche la page de se recharger
    if (input.value) {
        // On envoie le message au serveur avec le badge 'chat message'
        socket.emit('chat message', input.value);
        input.value = ''; // On vide le champ de texte
    }
});

// Quand le serveur nous envoie un message (provenant de n'importe qui)
socket.on('chat message', (msg) => {
    const item = document.createElement('li');
    item.textContent = msg;
    messages.appendChild(item);
    
    // Auto-scroll vers le bas pour voir le dernier message
    messages.scrollTop = messages.scrollHeight;
});