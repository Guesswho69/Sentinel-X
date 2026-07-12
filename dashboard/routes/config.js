/**
 * Sentinel-X Dashboard - Guild configuration routes
 * -------------------------------------
 * Thin HTTP layer only: extract params/body, call guildConfigService, map
 * the result or a ValidationError to a response. All actual business logic
 * (schema validation, merging, persistence) lives in
 * dashboard/services/guildConfigService.js and shared/guildConfigStore.js.
 *
 * Every route is protected by requireAuth + requireGuildAccess, so a user
 * can only ever read or change configuration for a guild they actually
 * administer and that Sentinel-X is already a member of.
 */

const express = require('express');
const { requireAuth, requireGuildAccess } = require('../middleware/auth');
const guildConfigService = require('../services/guildConfigService');
const { ValidationError } = require('../utils/validation');

const router = express.Router();

/**
 * Wraps a route handler so ValidationErrors become 400s, and anything
 * else becomes a logged 500 - route bodies stay free of repeated try/catch.
 * @param {(req: import('express').Request) => Promise<any>|any} handler
 */
function handle(handler) {
    return async (req, res) => {
        try {
            const result = await handler(req);
            res.json(result);
        } catch (err) {
            if (err instanceof ValidationError) {
                return res.status(err.status).json({ error: err.message });
            }
            console.error('[Sentinel-X Dashboard] Config route error:', err);
            res.status(500).json({ error: 'Failed to process configuration change' });
        }
    };
}

// GET the full resolved configuration for a guild
router.get(
    '/guilds/:guildId/config',
    requireAuth,
    requireGuildAccess,
    handle((req) => guildConfigService.getConfig(req.params.guildId, req.guild.name))
);

// PATCH individual sections - matches the dashboard's Security / Moderation /
// Logging / Commands pages, so each page saves only its own section.
router.patch(
    '/guilds/:guildId/security',
    requireAuth,
    requireGuildAccess,
    handle((req) => guildConfigService.updateSecurity(req.params.guildId, req.guild.name, req.body || {}))
);

router.patch(
    '/guilds/:guildId/moderation',
    requireAuth,
    requireGuildAccess,
    handle((req) => guildConfigService.updateModeration(req.params.guildId, req.guild.name, req.body || {}))
);

router.patch(
    '/guilds/:guildId/logging',
    requireAuth,
    requireGuildAccess,
    handle((req) => guildConfigService.updateLogging(req.params.guildId, req.guild.name, req.body || {}))
);

router.patch(
    '/guilds/:guildId/commands',
    requireAuth,
    requireGuildAccess,
    handle((req) => guildConfigService.updateCommands(req.params.guildId, req.guild.name, req.body || {}))
);

module.exports = router;
