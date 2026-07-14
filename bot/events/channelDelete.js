/**
 * Sentinel-X - channelDelete event handler
 * -------------------------------------
 * Thin forwarder - see channelCreate.js for why there's nothing else to do here.
 */

const logger = require('../logger');
const antiNuke = require('../security/antiNuke');

/**
 * @param {import('discord.js').GuildChannel} channel
 */
async function handleChannelDelete(channel) {
    try {
        if (!channel.guild) return;
        await antiNuke.handleChannelDelete(channel);
    } catch (error) {
        logger.logError('Unhandled error in channelDelete handler', error);
    }
}

module.exports = handleChannelDelete;
