const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { initDatabase, getDb } = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- ROUTES AUTHENTIFICATION ---

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    const db = getDb();
    if (!username || !password) return res.status(400).json({ error: "Champs incomplets." });

    try {
        const saltRounds = 10;
        const hash = await bcrypt.hash(password, saltRounds);
        const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`;
        
        // Insertion de l'utilisateur
        const result = await db.run(
            'INSERT INTO users (username, password_hash, avatar_url, bio) VALUES (?, ?, ?, ?)', 
            [username, hash, defaultAvatar, 'Pas de biographie pour le moment.']
        );
        
        // 🛠️ CORRECTION : On récupère l'ID qui vient d'être généré par SQLite
        const newUserId = result.lastID;

        // On connecte directement l'utilisateur en renvoyant son profil complet
        res.json({ 
            success: true, 
            user: { id: newUserId, username, bio: 'Pas de biographie pour le moment.', avatar: defaultAvatar } 
        });
    } catch (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: "Ce pseudo est déjà pris !" });
        res.status(500).json({ error: "Erreur serveur lors de l'inscription." });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const db = getDb();
    try {
        const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        if (!user) return res.status(400).json({ error: "Identifiants incorrects." });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(400).json({ error: "Identifiants incorrects." });

        res.json({ success: true, user: { id: user.id, username: user.username, bio: user.bio, avatar: user.avatar_url } });
    } catch (err) { res.status(500).json({ error: "Erreur serveur." }); }
});

app.post('/api/profile/update', upload.single('avatarFile'), async (req, res) => {
    const { userId, username, bio, currentPassword, newPassword } = req.body;
    const db = getDb();

    try {
        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) return res.status(400).json({ error: "Utilisateur introuvable." });

        let finalUsername = username || user.username;
        let finalBio = bio !== undefined ? bio : user.bio;
        let finalAvatarUrl = user.avatar_url;
        let finalPasswordHash = user.password_hash;

        if (req.file) {
            finalAvatarUrl = `/uploads/${req.file.filename}`;
        }

        if (newPassword || (username && username !== user.username)) {
            if (!currentPassword) {
                return res.status(400).json({ error: "Le mot de passe actuel est requis." });
            }
            const match = await bcrypt.compare(currentPassword, user.password_hash);
            if (!match) return res.status(400).json({ error: "Mot de passe actuel incorrect." });

            if (newPassword) {
                finalPasswordHash = await bcrypt.hash(newPassword, 10);
            }
        }

        await db.run(
            'UPDATE users SET username = ?, bio = ?, avatar_url = ?, password_hash = ? WHERE id = ?',
            [finalUsername, finalBio, finalAvatarUrl, finalPasswordHash, userId]
        );

        res.json({
            success: true,
            user: { id: user.id, username: finalUsername, bio: finalBio, avatar: finalAvatarUrl }
        });

    } catch (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: "Ce nom d'utilisateur est déjà utilisé." });
        res.status(500).json({ error: "Erreur lors de la modification." });
    }
});

// --- TEMPS RÉEL (SOCKET.IO) ---
io.on('connection', (socket) => {
    const db = getDb();

    socket.on('demande historique', async () => {
        try {
            const historique = await db.all(`
                SELECT users.username as pseudo, messages.texte, users.avatar_url as avatar 
                FROM messages 
                LEFT JOIN users ON messages.user_id = users.id 
                ORDER BY messages.id DESC LIMIT 50
            `);
            socket.emit('chargement historique', historique.reverse());
        } catch (err) { console.error(err); }
    });

    socket.on('chat message', async (data) => {
        try {
            const userIdNum = parseInt(data.userId);
            if (isNaN(userIdNum) || userIdNum <= 0) return;

            await db.run('INSERT INTO messages (user_id, texte) VALUES (?, ?)', [userIdNum, data.texte]);
            
            io.emit('chat message', {
                pseudo: data.pseudo,
                texte: data.texte,
                avatar: data.avatar
            });
        } catch (err) { console.error(err); }
    });

    socket.on('typing', (data) => { socket.broadcast.emit('typing', data); });
});

const PORT = 3000;
async function start() { await initDatabase(); server.listen(PORT); }
start();