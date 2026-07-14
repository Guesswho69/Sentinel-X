/**
 * Sentinel-X - webhooksUpdate event handler
 * -------------------------------------
 * Thin forwarder to antiWebhook.js. Fires whenever any webhook in a
 * channel is created, edited, or deleted - antiWebhook.js itself narrows
 * that down to "was this actually a creation?" via the audit log.
 */

const logger = require('../logger');
const antiWebhook = require('../security/antiWebhook');

/**
 * @param {import('discord.js').TextChannel} channel
 */
async function handleWebhooksUpdate(channel) {
    try {
        await antiWebhook.handleWebhooksUpdate(channel);
    } catch (error) {
        logger.logError('Unhandled error in webhooksUpdate handler', error);
    }
}

module.exports = handleWebhooksUpdate;

