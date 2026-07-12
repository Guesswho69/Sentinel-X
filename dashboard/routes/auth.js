/**
 * Sentinel-X Dashboard - Auth routes
 * -------------------------------------
 * Implements the Discord OAuth2 flow directly against Discord's REST API
 * (see discordApi.js). No passwords are ever collected or stored - Discord
 * is the only identity provider.
 */

const express = require('express');
const crypto = require('crypto');

const discordApi = require('../discordApi');

const router = express.Router();

// GET /auth/login - redirect the browser to Discord's consent screen
router.get('/login', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;
    res.redirect(discordApi.buildAuthorizeUrl(state));
});

// GET /auth/callback - Discord redirects here after the user approves/denies
router.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
        return res.redirect(`/login.html?error=${encodeURIComponent(String(error))}`);
    }

    if (!code || !state || state !== req.session.oauthState) {
        return res.redirect('/login.html?error=invalid_state');
    }

    delete req.session.oauthState;

    try {
        const tokenData = await discordApi.exchangeCode(String(code));

        const [user, userGuilds, botGuildIds] = await Promise.all([
            discordApi.fetchCurrentUser(tokenData.access_token),
            discordApi.fetchUserGuilds(tokenData.access_token),
            discordApi.fetchBotGuildIds(),
        ]);

        const eligibleGuilds = userGuilds
            .filter((guild) => discordApi.hasManageAccess(guild) && botGuildIds.has(guild.id))
            .map((guild) => ({
                id: guild.id,
                name: guild.name,
                icon: guild.icon,
                owner: !!guild.owner,
            }));

        // Session-only storage: req.session is server-side (identified to the
        // browser only by an opaque cookie ID) and expires with the cookie.
        // The access token is kept here just long enough to power this
        // session's guild list and is never written to the database.
        req.session.user = {
            id: user.id,
            username: user.username,
            globalName: user.global_name || null,
            avatar: user.avatar,
        };
        req.session.accessToken = tokenData.access_token;
        req.session.eligibleGuilds = eligibleGuilds;

        res.redirect('/guilds.html');
    } catch (err) {
        console.error('[Sentinel-X Dashboard] OAuth callback failed:', err);
        res.redirect('/login.html?error=oauth_failed');
    }
});

// POST /auth/logout - destroy the session and clear the cookie
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('[Sentinel-X Dashboard] Failed to destroy session:', err);
        }
        res.clearCookie('sentinelx.sid');
        res.redirect('/login.html');
    });
});

module.exports = router;
