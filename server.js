const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// On dit à Express de servir les fichiers qui sont dans le dossier 'public'
app.use(express.static('public'));

// Quand un utilisateur se connecte au chat
io.on('connection', (socket) => {
    console.log('Un utilisateur s\'est connecté ! ✅');

    // Quand le serveur reçoit un message d'un client
    socket.on('chat message', (msg) => {
        // Le serveur renvoie ce message à TOUT LE MONDE
        io.emit('chat message', msg);
    });

    // Quand un utilisateur ferme l'onglet
    socket.on('disconnect', () => {
        console.log('Un utilisateur s\'est déconnecté... ❌');
    });
});

// On lance le serveur sur le port 3000
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Le serveur tourne sur http://localhost:${PORT}`);
});