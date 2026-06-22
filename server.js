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

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    const db = getDb();
    if (!username || !password) return res.status(400).json({ error: "Champs incomplets." });

    try {
        const saltRounds = 10;
        const hash = await bcrypt.hash(password, saltRounds);
        // Crée l'utilisateur avec un avatar par défaut lié à son pseudo
        const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`;
        await db.run('INSERT INTO users (username, password_hash, avatar_url) VALUES (?, ?, ?)', [username, hash, defaultAvatar]);
        res.json({ success: true, message: "Compte créé ! Tu peux te connecter." });
    } catch (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: "Ce pseudo est déjà pris !" });
        res.status(500).json({ error: "Erreur serveur." });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const db = getDb();

    try {
        const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        if (!user) return res.status(400).json({ error: "Utilisateur introuvable." });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(400).json({ error: "Mot de passe incorrect." });

        res.json({ 
            success: true, 
            user: { id: user.id, username: user.username, bio: user.bio, avatar: user.avatar_url } 
        });
    } catch (err) {
        res.status(500).json({ error: "Erreur serveur." });
    }
});

// 🛠️ NOUVELLE ROUTE : MISE À JOUR DU PROFIL
app.post('/api/profile/update', async (req, res) => {
    const { userId, bio, avatarUrl } = req.body;
    const db = getDb();

    try {
        await db.run('UPDATE users SET bio = ?, avatar_url = ? WHERE id = ?', [bio, avatarUrl, userId]);
        // Récupère l'utilisateur mis à jour pour renvoyer les nouvelles infos au client
        const updatedUser = await db.get('SELECT id, username, bio, avatar_url FROM users WHERE id = ?', [userId]);
        res.json({ 
            success: true, 
            user: { id: updatedUser.id, username: updatedUser.username, bio: updatedUser.bio, avatar: updatedUser.avatar_url } 
        });
    } catch (err) {
        res.status(500).json({ error: "Impossible de mettre à jour le profil." });
    }
});

// --- TEMPS RÉEL (SOCKET.IO) ---
io.on('connection', async (socket) => {
    console.log('Un utilisateur est connecté au socket ✅');
    const db = getDb();

    // Envoi de l'historique combiné avec la photo de profil (pdp) de chaque auteur via un "JOIN" SQL
    try {
        const historique = await db.all(`
            SELECT messages.username as pseudo, messages.texte, users.avatar_url as avatar 
            FROM messages 
            LEFT JOIN users ON messages.username = users.username 
            ORDER BY messages.id DESC LIMIT 50
        `);
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

    // 🕒 Écouter quand quelqu'un écrit
    socket.on('typing', (data) => {
        socket.broadcast.emit('typing', data);
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