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
        if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');
        cb(null, './uploads'); 
    },
    filename: (req, file, cb) => { cb(null, Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

const sessionsActives = {};

// Récupérer la liste des IDs bloqués par ou ciblant un utilisateur
async function obtenirIdsBloques(userId) {
    const db = getDb();
    const rows = await db.all(`
        SELECT user_one_id, user_two_id FROM friends 
        WHERE status = 'blocked' AND (user_one_id = ? OR user_two_id = ?)
    `, [userId, userId]);
    const ids = new Set();
    rows.forEach(r => {
        ids.add(r.user_one_id);
        ids.add(r.user_two_id);
    });
    ids.delete(userId);
    return Array.from(ids);
}

async function diffuserMembresGlobale() {
    const db = getDb();
    // On sélectionne TOUS les utilisateurs enregistrés
    const users = await db.all('SELECT id, username, avatar_url, bio, status_type FROM users');
    
    for (const uId in sessionsActives) {
        const bloques = await obtenirIdsBloques(parseInt(uId));
        // On filtre uniquement pour enlever les personnes bloquées
        const listeFiltree = users
            .filter(u => !bloques.includes(u.id))
            .map(u => ({
                id: u.id,
                username: u.username,
                avatar_url: u.avatar_url || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y',
                bio: u.bio || '',
                status_type: u.status_type,
                enLigne: !!sessionsActives[u.id]
            }));
        io.to(sessionsActives[uId].socketId).emit('liste membres', listeFiltree);
    }
}

async function envoyerDMsListe(socket, userId) {
    const db = getDb();
    
    // On récupère uniquement les utilisateurs avec qui on a une relation 'accepted'
    const users = await db.all(`
        SELECT u.id, u.username, u.avatar_url 
        FROM users u
        JOIN friends f ON (f.user_one_id = u.id OR f.user_two_id = u.id)
        WHERE f.status = 'accepted' AND u.id != ? AND (f.user_one_id = ? OR f.user_two_id = ?)
    `, [userId, userId, userId]);

    const filtered = users.map(u => ({
        id: u.id,
        username: u.username,
        avatar_url: u.avatar_url || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'
    }));
    
    socket.emit('liste dms', filtered);
}

// REST API
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Champs requis.' });
    const db = getDb();
    try {
        const hash = await bcrypt.hash(password, 10);
        const r = await db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash]);
        res.json({ id: r.lastID, username });
    } catch(e) { res.status(400).json({ error: 'Ce pseudo est déjà pris.' }); }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const db = getDb();
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(400).json({ error: 'Identifiants incorrects.' });
    }
    res.json({ id: user.id, username: user.username, avatar_url: user.avatar_url, bio: user.bio, status_type: user.status_type });
});

app.post('/api/profile/update', upload.single('avatarFile'), async (req, res) => {
    const { userId, activeTab, bio, username, currentPassword, newPassword } = req.body;
    const db = getDb();
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if(!user) return res.status(404).json({ error: 'User non trouvé.' });

    if (activeTab === 'tab-profile') {
        let avatarUrl = user.avatar_url;
        if (req.file) avatarUrl = `/uploads/${req.file.filename}`;
        await db.run('UPDATE users SET bio = ? WHERE id = ?', [bio, userId]);
        if(req.file) await db.run('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, userId]);
        const updated = await db.get('SELECT id, username, avatar_url, bio, status_type FROM users WHERE id = ?', [userId]);
        await diffuserMembresGlobale();
        return res.json({ user: updated });
    } else {
        if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
            return res.status(400).json({ error: 'Mot de passe actuel incorrect.' });
        }
        let newHash = user.password_hash;
        if (newPassword && newPassword.trim() !== "") newHash = await bcrypt.hash(newPassword, 10);
        try {
            await db.run('UPDATE users SET username = ?, password_hash = ? WHERE id = ?', [username, newHash, userId]);
            const updated = await db.get('SELECT id, username, avatar_url, bio, status_type FROM users WHERE id = ?', [userId]);
            await diffuserMembresGlobale();
            return res.json({ user: updated });
        } catch(e) { return res.status(400).json({ error: 'Nom d\'utilisateur déjà pris.' }); }
    }
});

app.post('/api/profile/delete', async (req, res) => {
    const { userId, password } = req.body;
    const db = getDb();
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(400).json({ error: 'Mot de passe incorrect.' });
    }
    await db.run('DELETE FROM users WHERE id = ?', [userId]);
    await db.run('DELETE FROM messages WHERE user_id = ? OR receiver_id = ?', [userId, userId]);
    await db.run('DELETE FROM friends WHERE user_one_id = ? OR user_two_id = ?', [userId, userId]);
    await diffuserMembresGlobale();
    res.json({ success: true });
});

app.post('/api/chat/upload', upload.single('chatFile'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Fichier manquant" });
    res.json({ fileUrl: `/uploads/${req.file.filename}`, fileType: req.file.mimetype });
});

// SOCKETS
io.on('connection', (socket) => {
    const db = getDb();

    socket.on('authentifier', async (userId) => {
        socket.userId = userId;
        sessionsActives[userId] = { socketId: socket.id };
        await envoyerDMsListe(socket, userId);
        await diffuserMembresGlobale();
    });

    socket.on('changer statut', async (statutType) => {
        if (!socket.userId) return;
        await db.run('UPDATE users SET status_type = ? WHERE id = ?', [statutType, socket.userId]);
        await diffuserMembresGlobale();
    });

    socket.on('demande historique', async (context) => {
        socket.currentContext = context;
        const bloques = await obtenirIdsBloques(socket.userId);
        let queryMessages = [];

        if (context.type === 'global') {
            queryMessages = await db.all(`
                SELECT m.*, u.username as pseudo, u.avatar_url as avatar FROM messages m 
                JOIN users u ON m.user_id = u.id WHERE m.receiver_id IS NULL ORDER BY m.timestamp ASC
            `);
        } else {
            queryMessages = await db.all(`
                SELECT m.*, u.username as pseudo, u.avatar_url as avatar FROM messages m 
                JOIN users u ON m.user_id = u.id 
                WHERE (m.user_id = ? AND m.receiver_id = ?) OR (m.user_id = ? AND m.receiver_id = ?) 
                ORDER BY m.timestamp ASC
            `, [socket.userId, context.id, context.id, socket.userId]);
        }

        // Masquer les messages des utilisateurs bloqués
        const formatted = queryMessages
            .filter(m => !bloques.includes(m.user_id))
            .map(m => ({
                id: m.id, senderId: m.user_id, pseudo: m.pseudo,
                avatar: m.avatar || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y',
                texte: m.texte, fileUrl: m.file_url, fileType: m.file_type
            }));
        socket.emit('chargement historique', formatted);

        socket.on('demande info profil', async (targetId) => {
            const db = getDb();
            const user = await db.get('SELECT id, username, avatar_url, bio FROM users WHERE id = ?', [targetId]);
            if (user) {
                socket.emit('info profil', user);
            }
        });
    });

    socket.on('chat message', async (data) => {
        if (!socket.userId) return;
        const bloques = await obtenirIdsBloques(socket.userId);
        if (data.target.type !== 'global' && bloques.includes(data.target.id)) return;

        const user = await db.get('SELECT username, avatar_url FROM users WHERE id = ?', [socket.userId]);
        const fileUrl = data.fileUrl || null;
        const fileType = data.fileType || null;

        let lastID;
        if (data.target.type === 'global') {
            const r = await db.run('INSERT INTO messages (user_id, texte, file_url, file_type) VALUES (?, ?, ?, ?)', [socket.userId, data.texte, fileUrl, fileType]);
            lastID = r.lastID;
        } else {
            const r = await db.run('INSERT INTO messages (user_id, receiver_id, texte, file_url, file_type) VALUES (?, ?, ?, ?, ?)', [socket.userId, data.target.id, data.texte, fileUrl, fileType]);
            lastID = r.lastID;
        }

        const payload = {
            id: lastID, senderId: socket.userId, pseudo: user.username,
            avatar: user.avatar_url || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y',
            texte: data.texte, isGlobal: data.target.type === 'global', receiverId: data.target.id, fileUrl, fileType
        };

        if (data.target.type === 'global') {
            // Diffuser à tout le monde. Les clients géreront le filtrage local si nécessaire ou rechargeront
            io.emit('chat message', payload);
        } else {
            if (sessionsActives[socket.userId]) io.to(sessionsActives[socket.userId].socketId).emit('chat message', payload);
            if (sessionsActives[data.target.id]) io.to(sessionsActives[data.target.id].socketId).emit('chat message', payload);
        }
    });

    socket.on('supprimer message', async (msgId) => {
        const msg = await db.get('SELECT user_id FROM messages WHERE id = ?', [msgId]);
        if (msg && msg.user_id === socket.userId) {
            await db.run('DELETE FROM messages WHERE id = ?', [msgId]);
            io.emit('message supprime', msgId);
        }
    });

    socket.on('editer message', async ({ msgId, nouveauTexte }) => {
        const msg = await db.get('SELECT user_id FROM messages WHERE id = ?', [msgId]);
        if (msg && msg.user_id === socket.userId) {
            await db.run('UPDATE messages SET texte = ? WHERE id = ?', [nouveauTexte, msgId]);
            io.emit('message edite', { msgId, nouveauTexte });
        }
    });

    // Relations, Amis et Blocages
    socket.on('recuperer relation ami', async (targetId) => {
        if(!socket.userId) return;
        const row = await db.get(`
            SELECT * FROM friends 
            WHERE (user_one_id = ? AND user_two_id = ?) OR (user_one_id = ? AND user_two_id = ?)
        `, [socket.userId, targetId, targetId, socket.userId]);
        socket.emit('statut relation ami', { targetId, relation: row || null });
    });

    socket.on('action ami', async ({ action, targetId }) => {
        if(!socket.userId) return;
        
        const existante = await db.get(`
            SELECT * FROM friends WHERE (user_one_id = ? AND user_two_id = ?) OR (user_one_id = ? AND user_two_id = ?)
        `, [socket.userId, targetId, targetId, socket.userId]);

        if(action === 'demande') {
            if(!existante) await db.run('INSERT INTO friends (user_one_id, user_two_id, status, action_user_id) VALUES (?, ?, "pending", ?)', [socket.userId, targetId, socket.userId]);
        } else if (action === 'accepter') {
            await db.run('UPDATE friends SET status = "accepted", action_user_id = ? WHERE (user_one_id = ? AND user_two_id = ?) OR (user_one_id = ? AND user_two_id = ?)', [socket.userId, socket.userId, targetId, targetId, socket.userId]);
        } else if (action === 'bloquer') {
            if (existante) {
                await db.run('UPDATE friends SET status = "blocked", action_user_id = ? WHERE (user_one_id = ? AND user_two_id = ?) OR (user_one_id = ? AND user_two_id = ?)', [socket.userId, socket.userId, targetId, targetId, socket.userId]);
            } else {
                await db.run('INSERT INTO friends (user_one_id, user_two_id, status, action_user_id) VALUES (?, ?, "blocked", ?)', [socket.userId, targetId, socket.userId]);
            }
        } else if (action === 'refuser' || action === 'supprimer' || action === 'debloquer') {
            await db.run('DELETE FROM friends WHERE (user_one_id = ? AND user_two_id = ?) OR (user_one_id = ? AND user_two_id = ?)', [socket.userId, targetId, targetId, socket.userId]);
        }

        const row = await db.get(`SELECT * FROM friends WHERE (user_one_id = ? AND user_two_id = ?) OR (user_one_id = ? AND user_two_id = ?)`, [socket.userId, targetId, targetId, socket.userId]);
        socket.emit('statut relation ami', { targetId, relation: row || null });
        
        // Rafraîchir les listes privées et globales pour appliquer le masquage
        await envoyerDMsListe(socket, socket.userId);
        if (sessionsActives[targetId]) {
            await envoyerDMsListe(io.sockets.sockets.get(sessionsActives[targetId].socketId), targetId);
        }
        await diffuserMembresGlobale();
    });

    socket.on('demande liste bloques', async () => {
        if(!socket.userId) return;
        const rows = await db.all(`
            SELECT f.*, u.id as u_id, u.username, u.avatar_url FROM friends f
            JOIN users u ON (f.user_one_id = u.id OR f.user_two_id = u.id)
            WHERE f.status = 'blocked' AND f.action_user_id = ? AND u.id != ?
        `, [socket.userId, socket.userId]);
        
        socket.emit('liste bloques', rows.map(r => ({
            id: r.u_id,
            username: r.username,
            avatar_url: r.avatar_url || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'
        })));
    });

    socket.on('disconnect', async () => { 
        if (socket.userId) {
            delete sessionsActives[socket.userId];
            await diffuserMembresGlobale();
        }
    });
});

async function start() { 
    await initDatabase();
    server.listen(3000, () => console.log('Serveur connecté sur le port 3000'));
}
start();