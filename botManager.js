const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { connectDb } = require('./database/database');

const SESSIONS_DIR = path.join(__dirname, 'sessions');

const activeSockets = new Map();
const runningTasks = new Map();

// WebSocket broadcasting (will be enhanced with actual WebSocket server)
let broadcastFunction = null;

function setBroadcastFunction(fn) {
    broadcastFunction = fn;
}

function broadcastLog(message, level = 'info') {
    console.log(`[${level.toUpperCase()}] ${message}`);
    if (broadcastFunction) {
        broadcastFunction({ type: 'log', message, level });
    }
}

async function updateSessionStatus(sessionId, status, log = null) {
    const db = await connectDb();
    await db.run('UPDATE sessions SET status = ?, last_log = ? WHERE id = ?', [status, log, sessionId]);

    if (log) {
        broadcastLog(`Session ${sessionId}: ${log}`, status === 'connected' ? 'info' : status === 'disconnected' ? 'error' : 'warning');
    }

    if (broadcastFunction) {
        broadcastFunction({ type: 'status_update', sessionId, status, log });
    }
}

async function updateTaskStatus(taskId, status, log = null) {
    const db = await connectDb();
    const task = await db.get('SELECT * FROM tasks WHERE id = ?', taskId);
    await db.run('UPDATE tasks SET status = ?, last_log = ? WHERE id = ?', [status, log, taskId]);

    if (log) {
        broadcastLog(`Task ${taskId}: ${log}`, status === 'running' ? 'info' : 'warning');
    }

    if (broadcastFunction) {
        broadcastFunction({ type: 'status_update', taskId, status, log });
    }
}

async function startSession(sessionId) {
    if (activeSockets.has(sessionId)) return activeSockets.get(sessionId);

    const sessionFile = path.join(SESSIONS_DIR, `session-${sessionId}`);
    if (!fs.existsSync(sessionFile)) {
        await updateSessionStatus(sessionId, 'logged_out', 'Session file missing.');
        return null;
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionFile);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            generateHighQualityLinkPreview: true,
        });

        activeSockets.set(sessionId, sock);
        await updateSessionStatus(sessionId, 'connecting');

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            const db = await connectDb();
            const session = await db.get('SELECT user_id FROM sessions WHERE id = ?', sessionId);
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                activeSockets.delete(sessionId);
                if (statusCode === DisconnectReason.loggedOut) {
                    fs.rmSync(sessionFile, { recursive: true, force: true });
                    updateSessionStatus(sessionId, 'logged_out', 'Logged out from phone.');
                    stopTasksForSession(sessionId);
                } else {
                    updateSessionStatus(sessionId, 'disconnected', `Connection closed: ${lastDisconnect?.error?.message}`);
                }
            } else if (connection === 'open') {
                const userName = sock.user?.name || 'Unknown User';
                const userNumber = sock.user?.id?.split(':')[0] || 'Unknown Number';
                const log = `Connected as ${userName} (${userNumber})`;
                updateSessionStatus(sessionId, 'connected', log);
            }
        });

        return sock;
    } catch (error) {
        await updateSessionStatus(sessionId, 'disconnected', `Failed to start session: ${error.message}`);
        return null;
    }
}

async function stopTasksForSession(sessionId) {
    const db = await connectDb();
    const tasks = await db.all('SELECT id FROM tasks WHERE session_id = ? AND status = ?', [sessionId, 'running']);
    for (const task of tasks) {
        await stopTask(task.id);
    }
}

async function startTask(taskId) {
    if (runningTasks.has(taskId)) return;

    const db = await connectDb();
    const task = await db.get('SELECT * FROM tasks WHERE id = ?', taskId);
    if (!task) return;

    const sock = await startSession(task.session_id);
    if (!sock) {
        await updateTaskStatus(taskId, 'stopped', 'Associated session is invalid.');
        return;
    }

    await updateTaskStatus(taskId, 'running', 'Task started.');

    // Parse single target and messages
    let target = task.target;
    let messages = [];

    try {
        messages = JSON.parse(task.messages || '[]');
    } catch (e) {
        await updateTaskStatus(taskId, 'stopped', 'Invalid task configuration.');
        return;
    }

    if (!target || messages.length === 0) {
        await updateTaskStatus(taskId, 'stopped', 'No target or messages configured.');
        return;
    }

    // Format target properly for WhatsApp
    if (task.target_type === 'group') {
        if (!target.includes('@g.us')) {
            target = target + '@g.us';
        }
    } else {
        if (!target.includes('@c.us')) {
            target = target + '@c.us';
        }
    }

    // Send messages to single target
    let messageIndex = 0;
    const intervalId = setInterval(async () => {
        try {
            let message = messages[messageIndex % messages.length];

            if (message && message.trim()) {
                // Add prefix if available
                if (task.prefix_name && task.prefix_name.trim()) {
                    message = `${task.prefix_name.trim()}: ${message}`;
                }

                await sock.sendMessage(target, { text: message });

                // Determine target type for logging
                const targetType = target.includes('@g.us') ? 'Group' : 'Contact';
                const targetDisplay = target.includes('@g.us') ? 
                    target.replace('@g.us', '') : 
                    target.replace('@c.us', '');

                const logMessage = `Message sent to ${targetType} (${targetDisplay}): "${message}"`;
                await updateTaskStatus(taskId, 'running', logMessage);
            }

            messageIndex++;
        } catch (error) {
            console.error('Error sending messages:', error);
            // Auto-restart task after error to prevent stopping
            await updateTaskStatus(taskId, 'running', `Error occurred, continuing task: ${error.message}`);
        }
    }, task.interval * 1000);

    runningTasks.set(taskId, intervalId);

    broadcastLog(`Task ${taskId} started for single target`, 'info');
}

async function getGroups(sessionId) {
    const sock = activeSockets.get(sessionId);
    if (!sock) return [];

    try {
        const groups = await sock.groupFetchAllParticipating();
        const groupList = [];

        for (const [groupId, group] of Object.entries(groups)) {
            groupList.push({
                id: groupId,
                name: group.subject || 'Unknown Group',
                participants: group.participants ? group.participants.length : 0
            });
        }

        return groupList;
    } catch (error) {
        console.error('Error fetching groups:', error);
        return [];
    }
}

async function stopTask(taskId) {
    if (runningTasks.has(taskId)) {
        clearInterval(runningTasks.get(taskId));
        runningTasks.delete(taskId);
    }
    await updateTaskStatus(taskId, 'stopped', 'Task stopped by user.');
    broadcastLog(`Task ${taskId} stopped`, 'warning');
}

async function initializeRunningTasks() {
    broadcastLog("Initializing tasks marked as 'running' from previous session...", 'info');
    const db = await connectDb();
    const tasksToRun = await db.all('SELECT id FROM tasks WHERE status = ?', 'running');
    for (const task of tasksToRun) {
        await startTask(task.id);
    }
    broadcastLog(`Initialized ${tasksToRun.length} tasks.`, 'info');
}

module.exports = { 
    startSession, 
    startTask, 
    stopTask, 
    initializeRunningTasks, 
    setBroadcastFunction,
    broadcastLog,
    getGroups 
};