/**
 * Sentinel-X - Anti-Caps
 * -------------------------------------
 * Detects messages with an excessive proportion of uppercase letters.
 * Short messages are ignored (minLength) since "OK" or "NO" trip a naive
 * percentage check without being spam.
 */

const { getGuildConfig } = require('../config/guildConfig');
const { SEVERITY } = require('../config/defaults');
const threatManager = require('./threatManager');

/**
 * @param {string} content
 * @returns {number} percentage (0-100) of uppercase letters among all letters
 */
function calculateUppercasePercent(content) {
    const letters = content.replace(/[^a-zA-Z]/g, '');
    if (letters.length === 0) return 0;
    const uppercaseCount = (letters.match(/[A-Z]/g) || []).length;
    return (uppercaseCount / letters.length) * 100;
}

/**
 * @param {import('discord.js').Message} message
 * @returns {Promise<{ isViolation: boolean, reason?: string }>}
 */
async function checkMessage(message) {
    const resolvedConfig = getGuildConfig(message.guild.id);
    const config = resolvedConfig.antiCaps;
    if (!config.enabled) return { isViolation: false };

    const content = message.content || '';
    if (content.length < config.minLength) return { isViolation: false };

    const uppercasePercent = calculateUppercasePercent(content);
    if (uppercasePercent <= config.maxUppercasePercent) return { isViolation: false };

    const reason = `Message was ${uppercasePercent.toFixed(0)}% uppercase (limit: ${config.maxUppercasePercent}%)`;

    await threatManager.reportThreat({
        guild: message.guild,
        user: message.author,
        module: 'antiCaps',
        type: 'EXCESSIVE_CAPS',
        severity: SEVERITY.LOW,
        reason,
        metadata: { uppercasePercent: uppercasePercent.toFixed(0) },
        resolvedConfig,
    });

    return { isViolation: true, reason };
}

module.exports = { checkMessage, calculateUppercasePercent };

