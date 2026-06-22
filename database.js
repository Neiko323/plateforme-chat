const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

let db;

async function initDatabase() {
    db = await open({
        filename: './discord_clone.db',
        driver: sqlite3.Database
    });

    // Table Utilisateurs
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password_hash TEXT,
            avatar_url TEXT,
            bio TEXT
        )
    `);

    // Table Messages modifiée pour supporter les Salons publics & Messages Privés (receiver_id NULL = salon général)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            receiver_id INTEGER DEFAULT NULL,
            texte TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Table Relations Amis (status: 'pending' ou 'accepted')
    await db.exec(`
        CREATE TABLE IF NOT EXISTS friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_one_id INTEGER,
            user_two_id INTEGER,
            status TEXT,
            action_user_id INTEGER
        )
    `);
}

function getDb() { return db; }

module.exports = { initDatabase, getDb };