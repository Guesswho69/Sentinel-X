/**
 * Sentinel-X Dashboard Server
 * -------------------------------------
 * Wires together:
 *   - Secure, server-side sessions (express-session)
 *   - Discord OAuth2 login (dashboard/routes/auth.js)
 *   - Guild list + per-guild config APIs (dashboard/routes/*)
 *   - The static dashboard frontend (dashboard/public)
 *
 * This runs as its own process, separate from the Discord bot
 * (bot/index.js). It never touches Discord passwords, and the only thing
 * it persists to disk is per-guild configuration - via shared/guildConfigStore.js,
 * the same store the bot process reads from (see dashboard/services/guildConfigService.js).
 * OAuth access tokens live only in the in-memory session for the duration
 * of that session.
 */

const path = require('path');
const express = require('express');
const session = require('express-session');

const { version: APP_VERSION } = require('../package.json');
const config = require('./config');
const { requireAuth } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const guildRoutes = require('./routes/guilds');
const configRoutes = require('./routes/config');
const guildMetaRoutes = require('./routes/guildMeta');

const app = express();
const startedAt = Date.now();

// Render terminates TLS at its edge proxy; trusting it lets Express see the
// request as secure so "secure" session cookies behave correctly.
app.set('trust proxy', 1);

app.use(express.json());

app.use(
    session({
        name: 'sentinelx.sid',
        secret: config.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        rolling: true, // reset the expiry countdown on every request, so an
                        // active user stays logged in instead of being kicked
                        // out exactly 24h after their original login
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: config.NODE_ENV === 'production',
            maxAge: 1000 * 60 * 60 * 24, // 24 hours of inactivity before expiry
        },
        // Default MemoryStore is fine for a single-instance foundation build.
        // Replace with a persistent store (Redis, connect-sqlite3, etc.) before
        // running multiple dashboard instances behind a load balancer.
    })
);

// ---------------------------------------------------------------------------
// Auth + API routes
// ---------------------------------------------------------------------------

app.use('/auth', authRoutes);
app.use('/api', guildRoutes);
app.use('/api', configRoutes);
app.use('/api', guildMetaRoutes);

app.get('/api/status', (req, res) => {
    try {
        const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);

        res.json({
            project: 'Sentinel-X',
            version: APP_VERSION,
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
// Protected pages
// -------------------------------------
// Matched before express.static, so an unauthenticated request is redirected
// to the login page instead of ever receiving the protected HTML.
// ---------------------------------------------------------------------------

app.get('/guilds.html', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'guilds.html'));
});

app.get('/guild.html', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'guild.html'));
});

// ---------------------------------------------------------------------------
// Static frontend (login page, public status overview, shared assets)
// ---------------------------------------------------------------------------

app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Fallback error handling
// ---------------------------------------------------------------------------

app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
    console.error('[Sentinel-X Dashboard] Unhandled request error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

app.listen(config.PORT, () => {
    console.log(`[Sentinel-X Dashboard] Listening on port ${config.PORT}`);
});

process.on('unhandledRejection', (error) => {
    console.error('[Sentinel-X Dashboard] Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('[Sentinel-X Dashboard] Uncaught exception:', error);
});

