/**
 * Sentinel-X - roleUpdate event handler
 * -------------------------------------
 * Thin forwarder to antiNuke.js's permission-abuse detection (a role
 * newly gaining Administrator). See channelCreate.js for why there's
 * nothing else for this handler to do.
 */

const logger = require('../logger');
const antiNuke = require('../security/antiNuke');

/**
 * @param {import('discord.js').Role} oldRole
 * @param {import('discord.js').Role} newRole
 */
async function handleRoleUpdate(oldRole, newRole) {
    try {
        await antiNuke.handleRoleUpdate(oldRole, newRole);
    } catch (error) {
        logger.logError('Unhandled error in roleUpdate handler', error);
    }
}

module.exports = handleRoleUpdate;

