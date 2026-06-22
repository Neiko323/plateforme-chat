const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const historiqueMessages = [];

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('Un utilisateur s\'est connecté ! ✅');

    // Envoyer l'historique (qui contient désormais des objets {pseudo, texte})
    socket.emit('chargement historique', historiqueMessages);

    // Écouter les nouveaux messages
    socket.on('chat message', (data) => {
        historiqueMessages.push(data);
        if (historiqueMessages.length > 50) historiqueMessages.shift();
        
        io.emit('chat message', data);
    });

    // Écouter quand quelqu'un écrit
    socket.on('typing', (data) => {
        // Envoie à tout le monde SAUF à celui qui écrit (broadcast)
        socket.broadcast.emit('typing', data);
    });

    socket.on('disconnect', () => {
        console.log('Un utilisateur s\'est déconnecté... ❌');
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Le serveur tourne sur http://localhost:${PORT}`);
});