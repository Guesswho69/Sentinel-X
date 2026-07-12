/**
 * Sentinel-X Dashboard - Session & guild list routes
 * -------------------------------------
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/session - lets the frontend know whether it should show
// logged-out (login) or logged-in (guild picker) UI.
router.get('/session', (req, res) => {
    if (!req.session.user) {
        return res.json({ authenticated: false });
    }
    res.json({ authenticated: true, user: req.session.user });
});

// GET /api/guilds - guilds the logged-in user can manage AND that already
// have Sentinel-X in them. Computed once at login time and cached in the
// session; re-login to refresh if server membership/roles have changed.
router.get('/guilds', requireAuth, (req, res) => {
    res.json({ guilds: req.session.eligibleGuilds || [] });
});

module.exports = router;
