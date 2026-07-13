/**
 * Sentinel-X Dashboard - Guild metadata routes
 * -------------------------------------
 * Exposes a guild's actual Discord channels/roles so the frontend can
 * offer real dropdowns (log channel pickers, trusted-role pickers)
 * instead of asking admins to paste raw Discord IDs by hand.
 *
 * Uses the bot's own token (via discordApi.js), NOT the logged-in user's
 * token - the bot must already be in the guild to manage it at all (see
 * requireGuildAccess), so it always has permission to list channels/roles.
 */

const express = require('express');
const { requireAuth, requireGuildAccess } = require('../middleware/auth');
const discordApi = require('../discordApi');

const router = express.Router();

// Discord channel type constants (stable, documented values) - avoided
// pulling in discord-api-types as an undeclared transitive dependency
// just for two integers.
const CHANNEL_TYPE_GUILD_TEXT = 0;
const CHANNEL_TYPE_GUILD_ANNOUNCEMENT = 5;

router.get('/guilds/:guildId/meta', requireAuth, requireGuildAccess, async (req, res) => {
    try {
        const [channels, roles] = await Promise.all([
            discordApi.fetchGuildChannels(req.params.guildId),
            discordApi.fetchGuildRoles(req.params.guildId),
        ]);

        const textChannels = channels
            .filter((ch) => ch.type === CHANNEL_TYPE_GUILD_TEXT || ch.type === CHANNEL_TYPE_GUILD_ANNOUNCEMENT)
            .map((ch) => ({ id: ch.id, name: ch.name }))
            .sort((a, b) => a.name.localeCompare(b.name));

        const assignableRoles = roles
            .filter((role) => role.name !== '@everyone' && !role.managed)
            .map((role) => ({ id: role.id, name: role.name, color: role.color }))
            .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name));

        res.json({ channels: textChannels, roles: assignableRoles });
    } catch (err) {
        console.error('[Sentinel-X Dashboard] Failed to fetch guild metadata:', err);
        res.status(502).json({ error: 'Failed to fetch data from Discord' });
    }
});

module.exports = router;

