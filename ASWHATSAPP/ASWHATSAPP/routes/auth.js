const express = require('express');
const bcrypt = require('bcrypt');
const { connectDb } = require('../database/database');
const router = express.Router();

const SALT_ROUNDS = 10;

// Register
router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    const db = await connectDb();
    const existingUser = await db.get('SELECT * FROM users WHERE username = ?', username);
    if (existingUser) {
        return res.status(409).json({ message: 'Username already exists.' });
    }
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    await db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);
    res.status(201).json({ message: 'User registered successfully.' });
});

// Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const db = await connectDb();
    const user = await db.get('SELECT * FROM users WHERE username = ?', username);
    if (user && (await bcrypt.compare(password, user.password))) {
        req.session.userId = user.id;
        res.json({ message: 'Login successful.' });
    } else {
        res.status(401).json({ message: 'Invalid credentials.' });
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ message: 'Could not log out.' });
        res.json({ message: 'Logout successful.' });
    });
});

// Check Auth Status
router.get('/check-auth', (req, res) => {
    if (req.session.userId) {
        res.json({ loggedIn: true });
    } else {
        res.json({ loggedIn: false });
    }
});

module.exports = router;