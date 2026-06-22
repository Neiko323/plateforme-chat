const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcrypt');
const { initDatabase, getDb } = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));

// --- ROUTES D'AUTHENTIFICATION ---

// 1. INSCRIPTION
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    const db = getDb();
    
    if (!username || !password) {
        return res.status(400).json({ error: "Champs incomplets." });
    }

    try {
        const saltRounds = 10;
        const hash = await bcrypt.hash(password, saltRounds);

        await db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash]);
        res.json({ success: true, message: "Compte créé ! Tu peux te connecter." });
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: "Ce pseudo est déjà pris !" });
        }
        res.status(500).json({ error: "Erreur serveur." });
    }
});

// 2. CONNEXION
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const db = getDb();

    try {
        const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        
        if (!user) {
            return res.status(400).json({ error: "Utilisateur introuvable." });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(400).json({ error: "Mot de passe incorrect." });
        }

        res.json({ 
            success: true, 
            user: { id: user.id, username: user.username, bio: user.bio, avatar: user.avatar_url } 
        });

    } catch (err) {
        res.status(500).json({ error: "Erreur serveur." });
    }
});

// --- TEMPS RÉEL (SOCKET.IO) ---
io.on('connection', async (socket) => {
    console.log('Un utilisateur est connecté au socket ✅');
    const db = getDb();

    // Envoi de l'historique
    try {
        const historique = await db.all('SELECT username as pseudo, texte FROM messages ORDER BY id DESC LIMIT 50');
        socket.emit('chargement historique', historique.reverse());
    } catch (err) {
        console.error("Erreur historique:", err);
    }

    // Réception et redistribution du message
    socket.on('chat message', async (data) => {
        try {
            await db.run('INSERT INTO messages (username, texte) VALUES (?, ?)', [data.pseudo, data.texte]);
            io.emit('chat message', data);
        } catch (err) {
            console.error("Erreur enregistrement message:", err);
        }
    });
});

const PORT = 3000;
async function start() {
    await initDatabase();
    server.listen(PORT, () => {
        console.log(`Le mini-Discord tourne sur http://localhost:${PORT}`);
    });
}

start();