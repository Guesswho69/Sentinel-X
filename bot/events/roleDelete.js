/**
 * Sentinel-X - roleDelete event handler
 * -------------------------------------
 * Thin forwarder - see channelCreate.js for why there's nothing else to do here.
 */

const logger = require('../logger');
const antiNuke = require('../security/antiNuke');

/**
 * @param {import('discord.js').Role} role
 */
async function handleRoleDelete(role) {
    try {
        await antiNuke.handleRoleDelete(role);
    } catch (error) {
        logger.logError('Unhandled error in roleDelete handler', error);
    }
}

module.exports = handleRoleDelete;

