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

// Dictionnaire contenant userId -> socket.id
const sessionsActives = {};

// ==========================================
//          ROUTES D'AUTHENTIFICATION
// ==========================================

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body; 
    const db = getDb();
    try {
        const hash = await bcrypt.hash(password, 10);
        const avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`;
        const result = await db.run(
            'INSERT INTO users (username, password_hash, avatar_url, bio) VALUES (?, ?, ?, ?)', 
            [username, hash, avatar, 'Pas de biographie pour le moment.']
        );
        res.json({ success: true, user: { id: result.lastID, username, bio: 'Pas de biographie pour le moment.', avatar } });
    } catch(e) { res.status(400).json({ error: "Nom d'utilisateur déjà pris." }); }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body; 
    const db = getDb();
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if(user && await bcrypt.compare(password, user.password_hash)) {
        res.json({ success: true, user: { id: user.id, username: user.username, bio: user.bio, avatar: user.avatar_url } });
    } else { res.status(400).json({ error: "Identifiants incorrects." }); }
});

app.post('/api/profile/update', upload.single('avatarFile'), async (req, res) => {
    const { userId, username, bio, currentPassword, newPassword, activeTab } = req.body; 
    const db = getDb();
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });

    let fUser = user.username, fBio = user.bio, fAvatar = user.avatar_url, fHash = user.password_hash;
    if (activeTab === 'tab-profile') {
        fBio = bio; if (req.file) fAvatar = `/uploads/${req.file.filename}`;
    } else {
        if (!await bcrypt.compare(currentPassword, user.password_hash)) return res.status(400).json({ error: "Mot de passe actuel erroné." });
        fUser = username; if (newPassword) fHash = await bcrypt.hash(newPassword, 10);
    }
    await db.run('UPDATE users SET username=?, bio=?, avatar_url=?, password_hash=? WHERE id=?', [fUser, fBio, fAvatar, fHash, userId]);
    res.json({ success: true, user: { id: user.id, username: fUser, bio: fBio, avatar: fAvatar } });
});

// ==========================================
//          SOCKET.IO LOGIQUE DU CHAT
// ==========================================

io.on('connection', (socket) => {
    const db = getDb();

    // Envoi sélectif de la liste adaptative des membres au panneau de droite
    async function diffuserMembres(socketCible, targetContext) {
        if (!socketCible.userId) return;
        
        if (!targetContext || targetContext.type === 'global') {
            // Contexte GÉNÉRAL : Récupérer TOUS les membres enregistrés
            const tousLesMembres = await db.all('SELECT id, username, avatar_url FROM users');
            const membresFormates = tousLesMembres.map(m => ({
                id: m.id,
                username: m.username,
                avatar_url: m.avatar_url,
                enLigne: !!sessionsActives[m.id]
            }));
            socketCible.emit('mise a jour membres', membresFormates);
        } else if (targetContext.type === 'dm') {
            // Contexte MP : Uniquement les deux utilisateurs concernés
            const deuxMembres = await db.all('SELECT id, username, avatar_url FROM users WHERE id = ? OR id = ?', [socketCible.userId, targetContext.id]);
            const membresFormates = deuxMembres.map(m => ({
                id: m.id,
                username: m.username,
                avatar_url: m.avatar_url,
                enLigne: !!sessionsActives[m.id]
            }));
            socketCible.emit('mise a jour membres', membresFormates);
        }
    }

    socket.on('authentification-socket', async (userId) => {
        socket.userId = parseInt(userId);
        sessionsActives[socket.userId] = socket.id;

        // Rafraîchir le panneau de droite de tout le monde (car un membre passe en ligne)
        const socketsConnectes = await io.fetchSockets();
        socketsConnectes.forEach(s => {
            if(s.currentContext) diffuserMembres(s, s.currentContext);
        });
    });

    async function envoyerListeAmis(uId) {
        const targetSocketId = sessionsActives[uId];
        if (!targetSocketId) return;
        const friends = await db.all(`
            SELECT id, username, avatar_url, bio FROM users WHERE id IN (
                SELECT user_one_id FROM friends WHERE user_two_id = ? AND status = 'accepted'
                UNION
                SELECT user_two_id FROM friends WHERE user_one_id = ? AND status = 'accepted'
            )
        `, [uId, uId]);
        io.to(targetSocketId).emit('mise a jour amis', friends);
    }

    socket.on('demande liste amis', () => { if (socket.userId) envoyerListeAmis(socket.userId); });

    socket.on('demande liste membres', (context) => {
        socket.currentContext = context; // Garde en mémoire où se trouve le client
        diffuserMembres(socket, context);
    });

    socket.on('demande historique', async (target) => {
        if (!socket.userId) return;
        let messages = [];
        if (target.type === 'global') {
            messages = await db.all(`
                SELECT users.username as pseudo, messages.user_id as senderId, messages.texte, users.avatar_url as avatar, true as isGlobal
                FROM messages LEFT JOIN users ON messages.user_id = users.id 
                WHERE messages.receiver_id IS NULL ORDER BY messages.id DESC LIMIT 50
            `);
        } else {
            messages = await db.all(`
                SELECT users.username as pseudo, messages.user_id as senderId, messages.receiver_id as receiverId, messages.texte, users.avatar_url as avatar, false as isGlobal
                FROM messages LEFT JOIN users ON messages.user_id = users.id 
                WHERE (messages.user_id = ? AND messages.receiver_id = ?) OR (messages.user_id = ? AND messages.receiver_id = ?)
                ORDER BY messages.id DESC LIMIT 50
            `, [socket.userId, target.id, target.id, socket.userId]);
        }
        socket.emit('chargement historique', messages.reverse());
    });

    socket.on('demande infos profil', async (targetId) => {
        if (!socket.userId) return;
        const target = await db.get('SELECT id, username, avatar_url, bio FROM users WHERE id = ?', [targetId]);
        if (!target) return;
        const relation = await db.get(`SELECT * FROM friends WHERE (user_one_id = ? AND user_two_id = ?) OR (user_one_id = ? AND user_two_id = ?)`, [socket.userId, targetId, targetId, socket.userId]);
        target.isFriend = relation && relation.status === 'accepted';
        target.hasSentRequest = relation && relation.status === 'pending' && relation.action_user_id === parseInt(targetId);
        target.hasReceivedRequest = relation && relation.status === 'pending' && relation.action_user_id === socket.userId;
        socket.emit('reponse infos profil', target);
    });

    socket.on('action ami', async (data) => {
        if (!socket.userId) return;
        if (data.action === 'request') {
            await db.run('INSERT INTO friends (user_one_id, user_two_id, status, action_user_id) VALUES (?, ?, ?, ?)', [socket.userId, data.targetId, 'pending', socket.userId]);
        } else if (data.action === 'accept') {
            await db.run('UPDATE friends SET status = "accepted" WHERE (user_one_id = ? AND user_two_id = ?) OR (user_one_id = ? AND user_two_id = ?)', [socket.userId, data.targetId, data.targetId, socket.userId]);
            envoyerListeAmis(socket.userId); envoyerListeAmis(data.targetId);
        }
    });

    socket.on('typing-start', (data) => {
        if (!socket.userId) return;
        const payload = { pseudo: data.pseudo, senderId: socket.userId, isGlobal: data.target.type === 'global' };
        if (data.target.type === 'global') {
            socket.broadcast.emit('typing-start', payload);
        } else {
            const cibleSocketId = sessionsActives[data.target.id];
            if (cibleSocketId) io.to(cibleSocketId).emit('typing-start', payload);
        }
    });

    socket.on('typing-stop', (data) => {
        if (!socket.userId) return;
        if (data.target && data.target.type === 'global') {
            socket.broadcast.emit('typing-stop');
        } else if (data.target) {
            const cibleSocketId = sessionsActives[data.target.id];
            if (cibleSocketId) io.to(cibleSocketId).emit('typing-stop');
        }
    });

    socket.on('chat message', async (data) => {
        if (!socket.userId) return;
        const sender = await db.get('SELECT username, avatar_url FROM users WHERE id = ?', [socket.userId]);
        const payload = { senderId: socket.userId, pseudo: sender.username, avatar: sender.avatar_url, texte: data.texte, isGlobal: data.target.type === 'global', receiverId: data.target.id };

        if (data.target.type === 'global') {
            await db.run('INSERT INTO messages (user_id, texte) VALUES (?, ?)', [socket.userId, data.texte]);
            io.emit('chat message', payload);
        } else {
            await db.run('INSERT INTO messages (user_id, receiver_id, texte) VALUES (?, ?, ?)', [socket.userId, data.target.id, data.texte]);
            if (sessionsActives[socket.userId]) io.to(sessionsActives[socket.userId]).emit('chat message', payload);
            if (sessionsActives[data.target.id]) io.to(sessionsActives[data.target.id]).emit('chat message', payload);
        }
    });

    socket.on('disconnect', async () => { 
        if (socket.userId) {
            delete sessionsActives[socket.userId];
            // Mettre à jour la liste globale pour avertir du passage hors ligne
            const socketsConnectes = await io.fetchSockets();
            socketsConnectes.forEach(s => {
                if(s.currentContext) diffuserMembres(s, s.currentContext);
            });
        }
    });
});

async function start() { 
    await initDatabase(); 
    server.listen(3000, () => console.log('⚡ Serveur lancé sur http://localhost:3000')); 
}
start();