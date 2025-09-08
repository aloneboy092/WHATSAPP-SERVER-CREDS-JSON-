const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { connectDb } = require('./database/database');

const SESSIONS_DIR = path.join(__dirname, 'sessions');

const activeSockets = new Map();
const runningTasks = new Map();

async function updateSessionStatus(sessionId, status, log = null) {
  const db = await connectDb();
  await db.run('UPDATE sessions SET status = ?, last_log = ? WHERE id = ?', [status, log, sessionId]);
  // Here you would broadcast the update via WebSocket
}

async function updateTaskStatus(taskId, status, log = null) {
    const db = await connectDb();
    await db.run('UPDATE tasks SET status = ?, last_log = ? WHERE id = ?', [status, log, taskId]);
    // Broadcast update
}

async function startSession(sessionId) {
  if (activeSockets.has(sessionId)) return activeSockets.get(sessionId);

  const sessionFile = path.join(SESSIONS_DIR, `session-${sessionId}`);
  if (!fs.existsSync(sessionFile)) {
    await updateSessionStatus(sessionId, 'logged_out', 'Session file missing.');
    return null;
  }
  
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

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
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
      const log = `Connected as ${sock.user.name || sock.user.id}`;
      updateSessionStatus(sessionId, 'connected', log);
    }
  });

  return sock;
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

    const messages = JSON.parse(task.messages);
    let msgIndex = 0;
    
    const intervalId = setInterval(async () => {
        const currentSocket = activeSockets.get(task.session_id);
        const session = await db.get('SELECT status FROM sessions WHERE id = ?', task.session_id);

        if (!currentSocket || session.status !== 'connected') {
            await updateTaskStatus(taskId, 'running', 'Waiting for session to connect...');
            return;
        }

        try {
            const jid = task.target.includes('@g.us') ? task.target : `${task.target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
            await currentSocket.sendMessage(jid, { text: messages[msgIndex].trim() });
            const log = `Message sent to ${task.target}: "${messages[msgIndex]}"`;
            await updateTaskStatus(taskId, 'running', log);
        } catch (error) {
            await updateTaskStatus(taskId, 'running', `Failed to send: ${error.message}`);
        }
        msgIndex = (msgIndex + 1) % messages.length;
    }, task.interval * 1000);

    runningTasks.set(taskId, intervalId);
}

async function stopTask(taskId) {
    if (runningTasks.has(taskId)) {
        clearInterval(runningTasks.get(taskId));
        runningTasks.delete(taskId);
    }
    await updateTaskStatus(taskId, 'stopped', 'Task stopped by user.');
}

async function initializeRunningTasks() {
    console.log("Initializing tasks marked as 'running' from previous session...");
    const db = await connectDb();
    const tasksToRun = await db.all('SELECT id FROM tasks WHERE status = ?', 'running');
    for (const task of tasksToRun) {
        await startTask(task.id);
    }
    console.log(`Initialized ${tasksToRun.length} tasks.`);
}

module.exports = { startSession, startTask, stopTask, initializeRunningTasks };