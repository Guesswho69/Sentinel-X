/**
 * Sentinel-X - channelCreate event handler
 * -------------------------------------
 * Thin forwarder: bot/security/antiNuke.js already contains all detection,
 * audit-log attribution, and alerting logic, and by design never applies
 * punishment itself (see that module's header comment) - so there is
 * nothing else for this handler to do beyond calling it and logging any
 * unexpected failure.
 */

const logger = require('../logger');
const antiNuke = require('../security/antiNuke');

/**
 * @param {import('discord.js').GuildChannel} channel
 */
async function handleChannelCreate(channel) {
    try {
        if (!channel.guild) return;
        await antiNuke.handleChannelCreate(channel);
    } catch (error) {
        logger.logError('Unhandled error in channelCreate handler', error);
    }
}

module.exports = handleChannelCreate;

