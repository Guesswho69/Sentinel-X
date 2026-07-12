/**
 * Sentinel-X Dashboard - Configuration
 * -------------------------------------
 * Centralizes environment variable access so the rest of the dashboard
 * never touches process.env directly. Fails loud (via a console warning,
 * not a crash) if OAuth-related variables are missing, since the status
 * API and static pages should still work even before OAuth is configured.
 */

require('dotenv').config();

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const BASE_URL = process.env.DASHBOARD_BASE_URL || `http://localhost:${PORT}`;

const REQUIRED_FOR_OAUTH = [
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'DISCORD_TOKEN',
    'SESSION_SECRET',
];

const missing = REQUIRED_FOR_OAUTH.filter((key) => !process.env[key]);
if (missing.length > 0) {
    console.warn(
        `[Sentinel-X Dashboard] Missing environment variables: ${missing.join(', ')}. ` +
        'Discord login will not work until these are set.'
    );
}

module.exports = {
    PORT,
    NODE_ENV,
    BASE_URL,
    // Falls back to a clearly-labeled dev secret so local runs don't crash;
    // this must be overridden in any real deployment.
    SESSION_SECRET: process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me',
    discord: {
        clientId: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        botToken: process.env.DISCORD_TOKEN,
        redirectUri: process.env.DISCORD_REDIRECT_URI || `${BASE_URL}/auth/callback`,
        scopes: ['identify', 'guilds'],
    },
};
