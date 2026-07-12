/**
 * Sentinel-X Dashboard - Auth middleware
 * -------------------------------------
 * Two guards:
 *   - requireAuth: is anyone logged in at all?
 *   - requireGuildAccess: is the logged-in user allowed to manage :guildId?
 *
 * Both read only from the session - never from the database - since guild
 * eligibility (permissions + bot membership) is a live Discord fact, not
 * something Sentinel-X should persist as ground truth.
 */

function requireAuth(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }

    if (req.originalUrl.startsWith('/api/')) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    return res.redirect('/login.html');
}

/**
 * Must be mounted on a route with a :guildId param, and after requireAuth.
 * Confirms the guild is one of the eligible guilds captured at login
 * (Administrator / Manage Server / owner, and Sentinel-X already present).
 */
function requireGuildAccess(req, res, next) {
    const { guildId } = req.params;
    const eligible = req.session.eligibleGuilds || [];
    const guild = eligible.find((g) => g.id === guildId);

    if (!guild) {
        return res.status(403).json({ error: 'You do not have access to this server.' });
    }

    req.guild = guild;
    next();
}

module.exports = { requireAuth, requireGuildAccess };
