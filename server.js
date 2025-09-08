const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const WebSocket = require('ws');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const { initializeRunningTasks, setBroadcastFunction } = require('./botManager');
const { connectDb } = require('./database/database');

// --- Basic Setup ---
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// This is a simplified way to handle file uploads without extra dependencies
const fileUpload = require('express-fileupload');
app.use(fileUpload());

app.use(session({
    secret: 'a-very-secret-key-that-you-should-change',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Serve static files from 'public' and the root for index.html
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// --- Routes ---
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);

// --- WebSocket Server (for real-time updates) ---
const wss = new WebSocket.Server({ server });
const userSockets = new Map(); // Map userId to WebSocket

wss.on('connection', (ws, req) => {
    console.log('Client connected via WebSocket');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'auth' && data.userId) {
                userSockets.set(data.userId, ws);
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('Client disconnected');
        // Remove from userSockets
        for (const [userId, socket] of userSockets.entries()) {
            if (socket === ws) {
                userSockets.delete(userId);
                break;
            }
        }
    });
    
    // Send initial connection message
    ws.send(JSON.stringify({
        type: 'log',
        message: 'Connected to real-time updates',
        level: 'info'
    }));
});

// Broadcast function for botManager
function broadcastToAll(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Set broadcast function in botManager
setBroadcastFunction(broadcastToAll);

// We need a way to broadcast updates to the correct user.
// This is a placeholder for a more robust pub/sub system.
async function broadcastToUser(userId, data) {
    const userWs = userSockets.get(userId);
    if (userWs && userWs.readyState === WebSocket.OPEN) {
        userWs.send(JSON.stringify(data));
    }
}

// --- Server Initialization ---
async function startServer() {
    await connectDb(); // Ensure DB is connected
    await initializeRunningTasks(); // Restart any tasks that were running

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is listening on http://0.0.0.0:${PORT}`);
        console.log('Run "npm run setup-db" if you haven\'t already.');
    });
}

startServer();
