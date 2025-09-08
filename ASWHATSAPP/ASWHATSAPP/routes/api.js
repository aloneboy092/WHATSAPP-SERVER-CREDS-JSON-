const express = require('express');
const { connectDb } = require('../database/database');
const { startTask, stopTask } = require('../botManager');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const SESSIONS_DIR = path.join(__dirname, '../sessions');

// Middleware to check if user is logged in
const isAuthenticated = (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Not authenticated.' });
    }
    next();
};

router.use(isAuthenticated);

// --- Sessions API ---
router.get('/sessions', async (req, res) => {
    const db = await connectDb();
    const sessions = await db.all('SELECT * FROM sessions WHERE user_id = ?', req.session.userId);
    res.json(sessions);
});

router.post('/sessions', async (req, res) => {
    const { name } = req.body;
    const credsFile = req.files?.credsFile;

    if (!name || !credsFile) {
        return res.status(400).json({ message: 'Session name and file are required.' });
    }

    const db = await connectDb();
    const result = await db.run('INSERT INTO sessions (user_id, name) VALUES (?, ?)', [req.session.userId, name]);
    const sessionId = result.lastID;
    
    if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR);
    const sessionPath = path.join(SESSIONS_DIR, `session-${sessionId}`);
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath);

    fs.writeFileSync(path.join(sessionPath, 'creds.json'), credsFile.data);

    res.status(201).json({ message: 'Session created successfully.', sessionId });
});


// --- Tasks API ---
router.get('/tasks', async (req, res) => {
    const db = await connectDb();
    const tasks = await db.all('SELECT * FROM tasks WHERE user_id = ?', req.session.userId);
    res.json(tasks);
});

router.post('/tasks', async (req, res) => {
    const { name, sessionId, target, messages, interval } = req.body;
    const db = await connectDb();
    const messagesJson = JSON.stringify(messages);
    const result = await db.run(
        'INSERT INTO tasks (user_id, session_id, name, target, messages, interval) VALUES (?, ?, ?, ?, ?, ?)',
        [req.session.userId, sessionId, name, target, messagesJson, interval]
    );
    res.status(201).json({ message: 'Task created.', taskId: result.lastID });
});

router.post('/tasks/:id/start', async (req, res) => {
    await startTask(parseInt(req.params.id));
    res.json({ message: 'Task start initiated.' });
});

router.post('/tasks/:id/stop', async (req, res) => {
    await stopTask(parseInt(req.params.id));
    res.json({ message: 'Task stop initiated.' });
});

module.exports = router;