const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const DB_FILE = './database/bot.db';
let db;

async function connectDb() {
  if (db) return db;
  db = await open({
    filename: DB_FILE,
    driver: sqlite3.Database,
  });
  return db;
}

async function initDb() {
  const database = await connectDb();
  await database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'disconnected', -- disconnected, connecting, connected, logged_out
      last_log TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      target TEXT NOT NULL,
      messages TEXT NOT NULL, -- JSON array of strings
      interval INTEGER NOT NULL,
      status TEXT DEFAULT 'stopped', -- stopped, running
      last_log TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);
  console.log('Database initialized successfully.');
}

module.exports = { connectDb, initDb };