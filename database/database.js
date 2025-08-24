
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'bot.db');

let db = null;

async function connectDb() {
    if (!db) {
        db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });
    }
    return db;
}

async function initDb() {
    const database = await connectDb();
    
    // Users table
    await database.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Sessions table
    await database.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'disconnected',
            last_log TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    `);

    // Check if tasks table exists and recreate it with all columns
    try {
        // Get existing tasks data
        const existingTasks = await database.all('SELECT * FROM tasks').catch(() => []);
        
        // Drop the old table
        await database.exec('DROP TABLE IF EXISTS tasks');
        
        // Create new tasks table with all required columns
        await database.exec(`
            CREATE TABLE tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                session_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                target TEXT NOT NULL,
                target_type TEXT DEFAULT 'contact',
                messages TEXT NOT NULL,
                interval INTEGER NOT NULL,
                prefix_name TEXT DEFAULT '',
                status TEXT DEFAULT 'stopped',
                last_log TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (session_id) REFERENCES sessions (id)
            )
        `);
        
        // Restore existing tasks data if any
        for (const task of existingTasks) {
            await database.run(`
                INSERT INTO tasks (id, user_id, session_id, name, target, target_type, messages, interval, prefix_name, status, last_log, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                task.id,
                task.user_id,
                task.session_id,
                task.name,
                task.target,
                task.target_type || 'contact',
                task.messages,
                task.interval,
                task.prefix_name || '',
                'stopped', // Reset all tasks to stopped
                task.last_log,
                task.created_at
            ]);
        }
        
        console.log('Tasks table recreated with all required columns');
    } catch (error) {
        console.error('Error recreating tasks table:', error);
        
        // Fallback: create table if it doesn't exist
        await database.exec(`
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                session_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                target TEXT NOT NULL,
                target_type TEXT DEFAULT 'contact',
                messages TEXT NOT NULL,
                interval INTEGER NOT NULL,
                prefix_name TEXT DEFAULT '',
                status TEXT DEFAULT 'stopped',
                last_log TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (session_id) REFERENCES sessions (id)
            )
        `);
    }

    console.log('Database initialized successfully with complete schema');
}

module.exports = { connectDb, initDb };
