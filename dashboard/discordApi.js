/**
 * Sentinel-X Dashboard - Discord API helper
 * -------------------------------------
 * Every direct call to Discord's REST/OAuth2 API lives here, so the routes
 * that use it stay focused on request/response handling instead of HTTP
 * plumbing. Nothing in this file writes to a database or disk - it only
 * talks to Discord and returns plain data.
 */

const config = require('./config');

const API_BASE = 'https://discord.com/api/v10';

const PERMISSIONS = {
    ADMINISTRATOR: 0x8n,
    MANAGE_GUILD: 0x20n,
};

/**
 * Builds the URL the user is sent to in order to approve the OAuth2 request.
 * @param {string} state - CSRF token, expected to be verified on callback
 */
function buildAuthorizeUrl(state) {
    const params = new URLSearchParams({
        client_id: config.discord.clientId,
        redirect_uri: config.discord.redirectUri,
        response_type: 'code',
        scope: config.discord.scopes.join(' '),
        state,
        prompt: 'consent',
    });
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

/**
 * Exchanges an OAuth2 authorization code for an access token.
 * @param {string} code
 * @returns {Promise<{access_token: string, token_type: string, expires_in: number, refresh_token: string, scope: string}>}
 */
async function exchangeCode(code) {
    const body = new URLSearchParams({
        client_id: config.discord.clientId,
        client_secret: config.discord.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.discord.redirectUri,
    });

    const response = await fetch(`${API_BASE}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Discord token exchange failed (${response.status}): ${text}`);
    }

    return response.json();
}

/**
 * Fetches the profile of the user who just authorized the app.
 * @param {string} accessToken
 */
async function fetchCurrentUser(accessToken) {
    const response = await fetch(`${API_BASE}/users/@me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch Discord user (${response.status})`);
    }

    return response.json();
}

/**
 * Fetches the guilds the authorizing user belongs to.
 * @param {string} accessToken
 */
async function fetchUserGuilds(accessToken) {
    const response = await fetch(`${API_BASE}/users/@me/guilds`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch user guilds (${response.status})`);
    }

    return response.json();
}

// Short-lived cache of the guild IDs Sentinel-X's bot account is a member of.
// Avoids hitting Discord's API on every single login when many users log in
// close together.
let botGuildCache = { ids: new Set(), fetchedAt: 0 };
const BOT_GUILD_CACHE_TTL_MS = 60_000;

/**
 * Fetches (and briefly caches) the set of guild IDs the bot is currently in.
 * @returns {Promise<Set<string>>}
 */
async function fetchBotGuildIds() {
    const now = Date.now();
    if (now - botGuildCache.fetchedAt < BOT_GUILD_CACHE_TTL_MS) {
        return botGuildCache.ids;
    }

    const response = await fetch(`${API_BASE}/users/@me/guilds`, {
        headers: { Authorization: `Bot ${config.discord.botToken}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch bot guilds (${response.status})`);
    }

    const guilds = await response.json();
    botGuildCache = { ids: new Set(guilds.map((g) => g.id)), fetchedAt: now };
    return botGuildCache.ids;
}

/**
 * Determines whether a user's membership entry for a guild grants them
 * Administrator or Manage Server level access (or guild ownership).
 * @param {{ owner?: boolean, permissions?: string|number }} guild
 */
function hasManageAccess(guild) {
    if (guild.owner) return true;
    if (!guild.permissions) return false;

    try {
        const perms = BigInt(guild.permissions);
        return (
            (perms & PERMISSIONS.ADMINISTRATOR) === PERMISSIONS.ADMINISTRATOR ||
            (perms & PERMISSIONS.MANAGE_GUILD) === PERMISSIONS.MANAGE_GUILD
        );
    } catch {
        return false;
    }
}

module.exports = {
    buildAuthorizeUrl,
    exchangeCode,
    fetchCurrentUser,
    fetchUserGuilds,
    fetchBotGuildIds,
    hasManageAccess,
};
