/**
 * Sentinel-X - Anti-Emoji Spam
 * -------------------------------------
 * Detects messages containing an excessive number of emojis - both custom
 * Discord emojis (<:name:id> / <a:name:id>) and standard Unicode emojis.
 */

const { getGuildConfig } = require('../config/guildConfig');
const { SEVERITY } = require('../config/defaults');
const threatManager = require('./threatManager');

const CUSTOM_EMOJI_REGEX = /<a?:\w+:\d+>/g;

// A pragmatic (not exhaustive) Unicode emoji range match - covers the vast
// majority of emoji actually used in chat, without pulling in a full
// Unicode emoji data dependency for a moderation heuristic.
const UNICODE_EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}]/gu;

/**
 * @param {string} content
 * @returns {number}
 */
function countEmojis(content) {
    if (!content) return 0;
    const customMatches = content.match(CUSTOM_EMOJI_REGEX) || [];
    // Strip already-matched custom emoji tags before counting Unicode emojis,
    // so a custom emoji's numeric ID isn't accidentally double counted.
    const withoutCustom = content.replace(CUSTOM_EMOJI_REGEX, '');
    const unicodeMatches = withoutCustom.match(UNICODE_EMOJI_REGEX) || [];
    return customMatches.length + unicodeMatches.length;
}

/**
 * @param {import('discord.js').Message} message
 * @returns {Promise<{ isViolation: boolean, reason?: string }>}
 */
async function checkMessage(message) {
    const resolvedConfig = getGuildConfig(message.guild.id);
    const config = resolvedConfig.antiEmojiSpam;
    if (!config.enabled) return { isViolation: false };

    const emojiCount = countEmojis(message.content);
    if (emojiCount <= config.maxEmojis) return { isViolation: false };

    const reason = `Message contained ${emojiCount} emojis (limit: ${config.maxEmojis})`;

    await threatManager.reportThreat({
        guild: message.guild,
        user: message.author,
        module: 'antiEmojiSpam',
        type: 'EMOJI_FLOOD',
        severity: SEVERITY.LOW,
        reason,
        metadata: { emojiCount },
        resolvedConfig,
    });

    return { isViolation: true, reason };
}

module.exports = { checkMessage, countEmojis };

