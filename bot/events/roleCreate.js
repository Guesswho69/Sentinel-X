/**
 * Sentinel-X - roleCreate event handler
 * -------------------------------------
 * Thin forwarder - see channelCreate.js for why there's nothing else to do here.
 */

const logger = require('../logger');
const antiNuke = require('../security/antiNuke');

/**
 * @param {import('discord.js').Role} role
 */
async function handleRoleCreate(role) {
    try {
        await antiNuke.handleRoleCreate(role);
    } catch (error) {
        logger.logError('Unhandled error in roleCreate handler', error);
    }
}

module.exports = handleRoleCreate;

