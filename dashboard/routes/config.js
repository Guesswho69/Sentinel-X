/**
 * Sentinel-X Dashboard - Guild configuration routes
 * -------------------------------------
 * Read/write access to the per-guild command and security module toggles.
 * Every route is protected by requireAuth + requireGuildAccess, so a user
 * can only ever read or change configuration for a guild they actually
 * administer and that Sentinel-X is already a member of.
 */

const express = require('express');
const { requireAuth, requireGuildAccess } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

router.get('/guilds/:guildId/config', requireAuth, requireGuildAccess, (req, res) => {
    try {
        const cfg = db.getGuildConfig(req.params.guildId, req.guild.name);
        res.json(cfg);
    } catch (err) {
        console.error('[Sentinel-X Dashboard] Failed to load guild config:', err);
        res.status(500).json({ error: 'Failed to load configuration' });
    }
});

router.post('/guilds/:guildId/config', requireAuth, requireGuildAccess, (req, res) => {
    const { commands, securityModules } = req.body || {};

    if (commands !== undefined && (typeof commands !== 'object' || commands === null)) {
        return res.status(400).json({ error: 'commands must be an object of booleans' });
    }
    if (securityModules !== undefined && (typeof securityModules !== 'object' || securityModules === null)) {
        return res.status(400).json({ error: 'securityModules must be an object of booleans' });
    }

    try {
        const updated = db.saveGuildConfig(req.params.guildId, req.guild.name, {
            commands,
            securityModules,
        });
        res.json(updated);
    } catch (err) {
        console.error('[Sentinel-X Dashboard] Failed to save guild config:', err);
        res.status(500).json({ error: 'Failed to save configuration' });
    }
});

module.exports = router;
