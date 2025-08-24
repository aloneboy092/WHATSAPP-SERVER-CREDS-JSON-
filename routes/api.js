
const express = require('express');
const { connectDb } = require('../database/database');
const { startTask, stopTask, getGroups } = require('../botManager');
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
    const { name, sessionId, target, targetType, messages, interval, prefixName } = req.body;
    const db = await connectDb();
    
    // Store messages as JSON string
    const messagesJson = JSON.stringify(messages);
    
    const result = await db.run(
        'INSERT INTO tasks (user_id, session_id, name, target, target_type, messages, interval, prefix_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [req.session.userId, sessionId, name, target, targetType || 'contact', messagesJson, interval, prefixName || '']
    );
    res.status(201).json({ message: 'Task created.', taskId: result.lastID });
});

router.put('/tasks/:id', async (req, res) => {
    const { name, sessionId, target, targetType, messages, interval, prefixName } = req.body;
    const taskId = req.params.id;
    const db = await connectDb();
    
    // Verify task belongs to user
    const task = await db.get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [taskId, req.session.userId]);
    if (!task) {
        return res.status(404).json({ message: 'Task not found.' });
    }
    
    // Stop task if it's running
    if (task.status === 'running') {
        await stopTask(parseInt(taskId));
    }
    
    const messagesJson = JSON.stringify(messages);
    
    await db.run(
        'UPDATE tasks SET name = ?, session_id = ?, target = ?, target_type = ?, messages = ?, interval = ?, prefix_name = ?, status = "stopped" WHERE id = ? AND user_id = ?',
        [name, sessionId, target, targetType || 'contact', messagesJson, interval, prefixName || '', taskId, req.session.userId]
    );
    
    res.json({ message: 'Task updated successfully.' });
});

router.post('/tasks/:id/start', async (req, res) => {
    const taskId = parseInt(req.params.id);
    const db = await connectDb();
    
    // Verify task belongs to user
    const task = await db.get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [taskId, req.session.userId]);
    if (!task) {
        return res.status(404).json({ message: 'Task not found.' });
    }
    
    await startTask(taskId);
    res.json({ message: 'Task start initiated.' });
});

router.post('/tasks/:id/stop', async (req, res) => {
    const taskId = parseInt(req.params.id);
    const db = await connectDb();
    
    // Verify task belongs to user
    const task = await db.get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [taskId, req.session.userId]);
    if (!task) {
        return res.status(404).json({ message: 'Task not found.' });
    }
    
    await stopTask(taskId);
    res.json({ message: 'Task stop initiated.' });
});

// Get groups for a session
router.get('/sessions/:id/groups', async (req, res) => {
    const sessionId = parseInt(req.params.id);
    const db = await connectDb();
    
    // Verify session belongs to user
    const session = await db.get('SELECT * FROM sessions WHERE id = ? AND user_id = ?', [sessionId, req.session.userId]);
    if (!session) {
        return res.status(404).json({ message: 'Session not found.' });
    }
    
    try {
        const groups = await getGroups(sessionId);
        res.json(groups);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch groups: ' + error.message });
    }
});

module.exports = router;
