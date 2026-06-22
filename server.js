const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 📦 Notre "base de données" temporaire en mémoire
const historiqueMessages = [];

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('Un utilisateur s\'est connecté ! ✅');

    // 🕒 Dès qu'un utilisateur se connecte, on lui envoie TOUS les anciens messages
    socket.emit('chargement historique', historiqueMessages);

    socket.on('chat message', (msg) => {
        // On ajoute le nouveau message à notre historique
        historiqueMessages.push(msg);

        // Si l'historique devient trop grand, on peut limiter aux 50 derniers messages
        if (historiqueMessages.length > 50) {
            historiqueMessages.shift(); // Supprime le plus vieux message
        }

        io.emit('chat message', msg);
    });

    socket.on('disconnect', () => {
        console.log('Un utilisateur s\'est déconnecté... ❌');
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Le serveur tourne sur http://localhost:${PORT}`);
});