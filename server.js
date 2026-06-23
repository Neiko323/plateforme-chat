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

// Helper pour obtenir la liste des IDs bloqués
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

// CORRECTION : Diffuse à droite UNIQUEMENT les amis acceptés de l'utilisateur (Exclut l'utilisateur lui-même)
// CORRECTION : Envoie la bonne liste selon le contexte (Membres globaux vs Amis)
async function diffuserMembresGlobale() {
    const db = getDb();
    const tousLesUtilisateurs = await db.all(`SELECT id, username, avatar_url, bio, status_type FROM users`);
    
    // 1. Construire la liste globale de TOUS les utilisateurs connectés (pour le # général)
    const listeGlobaleConnectee = tousLesUtilisateurs.map(u => ({
        id: u.id,
        username: u.username,
        avatar_url: u.avatar_url || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y',
        bio: u.bio || '',
        status_type: u.status_type,
        enLigne: !!sessionsActives[u.id]
    }));

    // 2. Envoyer la liste personnalisée à chaque session active
    for (const uId in sessionsActives) {
        const userIdInt = parseInt(uId);
        
        // On récupère uniquement les amis acceptés de cet utilisateur spécifique
        const mesAmis = await db.all(`
            SELECT u.id, u.username, u.avatar_url, u.bio, u.status_type 
            FROM users u
            JOIN friends f ON (f.user_one_id = u.id OR f.user_two_id = u.id)
            WHERE f.status = 'accepted' AND u.id != ? AND (f.user_one_id = ? OR f.user_two_id = ?)
        `, [userIdInt, userIdInt, userIdInt]);

        const listeAmisFiltree = mesAmis.map(u => ({
            id: u.id,
            username: u.username,
            avatar_url: u.avatar_url || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y',
            bio: u.bio || '',
            status_type: u.status_type,
            enLigne: !!sessionsActives[u.id]
        }));
        
        // On envoie les DEUX listes au client
        io.to(sessionsActives[uId].socketId).emit('listes membres dispatch', {
            globale: listeGlobaleConnectee.filter(m => m.id !== userIdInt), // Tout le monde sauf soi
            amis: listeAmisFiltree
        });
    }
}

// Envoie la liste des DMs (Uniquement les amis acceptés)
async function envoyerDMsListe(socket, userId) {
    const db = getDb();
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

// Helper pour renvoyer la vue d'amis centrale
async function envoyerVueAmisCentrale(socket, userId) {
    const db = getDb();
    const rows = await db.all(`
        SELECT f.*, u.id as u_id, u.username, u.avatar_url FROM friends f
        JOIN users u ON (f.user_one_id = u.id OR f.user_two_id = u.id)
        WHERE (f.status = 'accepted' OR f.status = 'pending') AND (f.user_one_id = ? OR f.user_two_id = ?) AND u.id != ?
    `, [userId, userId, userId]);
    socket.emit('liste vue amis centrale', rows);
}

// API REST
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
        await envoyerVueAmisCentrale(socket, userId);
    });

    socket.on('changer statut', async (statutType) => {
        if (!socket.userId) return;
        await db.run('UPDATE users SET status_type = ? WHERE id = ?', [statutType, socket.userId]);
        await diffuserMembresGlobale();
    });

    socket.on('demande info profil', async (targetId) => {
        const user = await db.get('SELECT id, username, avatar_url, bio FROM users WHERE id = ?', [targetId]);
        if (user) socket.emit('info profil', user);
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
        } else if (context.type === 'dm') {
            queryMessages = await db.all(`
                SELECT m.*, u.username as pseudo, u.avatar_url as avatar FROM messages m 
                JOIN users u ON m.user_id = u.id 
                WHERE (m.user_id = ? AND m.receiver_id = ?) OR (m.user_id = ? AND m.receiver_id = ?) 
                ORDER BY m.timestamp ASC
            `, [socket.userId, context.id, context.id, socket.userId]);
        } else { return; }

        const formatted = queryMessages
            .filter(m => !bloques.includes(m.user_id))
            .map(m => ({
                id: m.id, senderId: m.user_id, pseudo: m.pseudo,
                avatar: m.avatar || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y',
                texte: m.texte, fileUrl: m.file_url, fileType: m.file_type
            }));
        socket.emit('chargement historique', formatted);
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

    // Gestion des relations
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
        
        await envoyerDMsListe(socket, socket.userId);
        await envoyerVueAmisCentrale(socket, socket.userId);
        if (sessionsActives[targetId]) {
            const tgtSocket = io.sockets.sockets.get(sessionsActives[targetId].socketId);
            if (tgtSocket) {
                await envoyerDMsListe(tgtSocket, targetId);
                await envoyerVueAmisCentrale(tgtSocket, targetId);
            }
        }
        await diffuserMembresGlobale();
    });

    socket.on('demande vue amis centrale', async () => {
        if (!socket.userId) return;
        await envoyerVueAmisCentrale(socket, socket.userId);
    });

    socket.on('demande liste bloques', async () => {
        if(!socket.userId) return;
        const rows = await db.all(`
            SELECT f.*, u.id as u_id, u.username, u.avatar_url FROM friends f
            JOIN users u ON (f.user_one_id = u.id OR f.user_two_id = u.id)
            WHERE f.status = 'blocked' AND f.action_user_id = ? AND u.id != ?
        `, [socket.userId, socket.userId]);
        
        socket.emit('liste bloques', rows.map(r => ({
            id: r.u_id, username: r.username,
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