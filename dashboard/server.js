/**
 * Sentinel-X Dashboard Server
 * -------------------------------------
 * A lightweight Express server whose only jobs are to:
 *   1. Serve the static dashboard frontend (dashboard/public)
 *   2. Expose a small status API for that frontend to poll
 *
 * This runs as its own process, separate from the Discord bot
 * (bot/index.js). Its purpose today is to give the Render Web Service
 * an open HTTP port to detect, plus a first working dashboard shell.
 * Wiring this up to the bot's live, in-memory state is a future step -
 * for now /api/status reports the dashboard's own view of the system.
 */

require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const startedAt = Date.now();

// ---------------------------------------------------------------------------
// Static frontend
// ---------------------------------------------------------------------------

app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

app.get('/api/status', (req, res) => {
    try {
        const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);

        res.json({
            project: 'Sentinel-X',
            bot: {
                status: 'online',
            },
            security: {
                engine: 'active',
            },
            system: {
                status: 'running',
                uptimeSeconds,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[Sentinel-X Dashboard] Failed to build status response:', error);
        res.status(500).json({ error: 'Failed to retrieve system status' });
    }
});

// ---------------------------------------------------------------------------
// Fallback error handling
// ---------------------------------------------------------------------------

// 404 handler for unknown API routes
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Generic error handler - keeps the process alive on unexpected failures
app.use((err, req, res, next) => {
    console.error('[Sentinel-X Dashboard] Unhandled request error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
    console.log(`[Sentinel-X Dashboard] Listening on port ${PORT}`);
});

process.on('unhandledRejection', (error) => {
    console.error('[Sentinel-X Dashboard] Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('[Sentinel-X Dashboard] Uncaught exception:', error);
});
