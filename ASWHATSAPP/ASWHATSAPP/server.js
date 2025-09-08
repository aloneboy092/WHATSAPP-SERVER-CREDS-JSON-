const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const WebSocket = require('ws');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const { initializeRunningTasks } = require('./botManager');
const { connectDb } = require('./database/database');

// --- Basic Setup ---
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 56884;

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
    // This is a simplified way to associate user with ws. A more robust way would use session parsing.
    // For now, we assume the client sends its ID after connection. This part would need more work.
    console.log('Client connected via WebSocket');
    ws.on('close', () => console.log('Client disconnected'));
});

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

    server.listen(PORT, () => {
        console.log(`Server is listening on http://localhost:${PORT}`);
        console.log('Run "npm run setup-db" if you haven't already.');
    });
}

startServer();