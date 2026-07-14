/**
 * Sentinel-X - Anti-Mention
 * -------------------------------------
 * Detects mass mentions in a single message and @everyone/@here abuse.
 *
 * Note on @everyone/@here: message.mentions.everyone is only true when the
 * mention actually resolved to a ping (i.e. the author had permission to
 * use it) - Discord itself already prevents the harmless case where
 * someone without permission just types the literal text. So this module
 * only ever fires on a mention that genuinely pinged the server.
 */

const { getGuildConfig } = require('../config/guildConfig');
const { SEVERITY } = require('../config/defaults');
const threatManager = require('./threatManager');

/**
 * @param {import('discord.js').Message} message
 * @returns {Promise<{ isViolation: boolean, reason?: string }>}
 */
async function checkMessage(message) {
    const resolvedConfig = getGuildConfig(message.guild.id);
    const config = resolvedConfig.antiMention;
    if (!config.enabled) return { isViolation: false };

    const mentionCount = message.mentions.users.size + message.mentions.roles.size;
    const everyoneAbuse = message.mentions.everyone && (config.blockEveryoneMention || config.blockHereMention);

    if (everyoneAbuse) {
        const usedHere = message.content.includes('@here');
        const reason = `Message used ${usedHere ? '@here' : '@everyone'}`;

        await threatManager.reportThreat({
            guild: message.guild,
            user: message.author,
            module: 'antiMention',
            type: 'EVERYONE_MENTION_ABUSE',
            severity: SEVERITY.HIGH,
            reason,
            metadata: { mentionType: usedHere ? '@here' : '@everyone' },
            resolvedConfig,
        });

        return { isViolation: true, reason };
    }

    if (mentionCount > config.maxMentionsPerMessage) {
        const reason = `Message mentioned ${mentionCount} users/roles (limit: ${config.maxMentionsPerMessage})`;

        await threatManager.reportThreat({
            guild: message.guild,
            user: message.author,
            module: 'antiMention',
            type: 'MASS_MENTION',
            severity: SEVERITY.MEDIUM,
            reason,
            metadata: { mentionCount },
            resolvedConfig,
        });

        return { isViolation: true, reason };
    }

    return { isViolation: false };
}

module.exports = { checkMessage };

