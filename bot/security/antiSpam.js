/**
 * Sentinel-X - Anti-Spam
 * -------------------------------------
 * Detects message flooding per user and recommends an escalating response:
 * repeat offenders get progressively longer timeouts rather than the same
 * flat punishment every time. Reports every violation to the Threat Manager.
 *
 * This module deliberately does NOT touch the Discord API to delete
 * messages or apply timeouts itself - it returns a recommendation, and the
 * caller (the messageCreate event handler) is responsible for carrying it
 * out. That keeps detection logic pure and testable, and keeps every
 * Discord-side side effect visible in one place (events/messageCreate.js).
 */

const { RateTracker } = require('../utils/rateTracker');
const { EscalationTracker } = require('../utils/escalationTracker');
const { getGuildConfig } = require('../config/guildConfig');
const { SEVERITY } = require('../config/defaults');
const threatManager = require('./threatManager');

const messageTracker = new RateTracker();
const escalationTracker = new EscalationTracker();

/**
 * @param {import('discord.js').Message} message
 * @returns {Promise<{ isViolation: boolean, action?: string, durationMs?: number, offenseCount?: number }>}
 */
async function checkMessage(message) {
    const config = getGuildConfig(message.guild.id).antiSpam;
    if (!config.enabled) return { isViolation: false };

    const key = `${message.guild.id}:${message.author.id}`;
    const messageCount = messageTracker.record(key, config.timeWindowMs);

    if (messageCount <= config.maxMessages) {
        return { isViolation: false };
    }

    const offenseCount = escalationTracker.recordOffense(key, config.offenseResetMs);
    const rung = EscalationTracker.resolveAction(offenseCount, config.escalation);

    const reason = `Sent ${messageCount} messages within ${config.timeWindowMs}ms (limit: ${config.maxMessages}); offense #${offenseCount}`;

    await threatManager.reportThreat({
        guild: message.guild,
        user: message.author,
        module: 'antiSpam',
        type: 'MESSAGE_FLOOD',
        severity: offenseCount >= 3 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
        reason,
        metadata: { messageCount, offenseCount, recommendedAction: rung.action },
        resolvedConfig: getGuildConfig(message.guild.id),
    });

    return {
        isViolation: true,
        action: rung.action,
        durationMs: rung.durationMs,
        offenseCount,
        reason,
    };
}

/**
 * Clears spam tracking for a user (e.g. moderator manually pardons them).
 * @param {string} guildId
 * @param {string} userId
 */
function resetUser(guildId, userId) {
    const key = `${guildId}:${userId}`;
    messageTracker.reset(key);
    escalationTracker.reset(key);
}

/** Periodic cleanup hook - call from a setInterval in bot/index.js. */
function cleanup() {
    messageTracker.cleanup();
    escalationTracker.cleanup();
}

module.exports = { checkMessage, resetUser, cleanup };

