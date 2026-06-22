const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

let db;

async function initDatabase() {
    db = await open({
        filename: 'discord_clone.db',
        driver: sqlite3.Database
    });

    // Table Utilisateurs
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        email TEXT UNIQUE,
        bio TEXT DEFAULT 'Pas de biographie pour le moment.',
        avatar_url TEXT DEFAULT 'https://api.dicebear.com/7.x/bottts/svg?seed=default'
      );
    `);

    // 🛠️ MODIFICATION ICI : On stocke l'id de l'utilisateur à la place de son nom
    await db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        texte TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("Base de données initialisée avec succès ! 📦");
    return db;
}

function getDb() { return db; }
module.exports = { initDatabase, getDb };