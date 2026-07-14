/**
 * Sentinel-X - Anti-Raid
 * -------------------------------------
 * Tracks how fast members are joining a guild. When joins exceed a
 * configured threshold within a time window, the guild enters an internal
 * "lockdown" state that:
 *   - other modules can check via isLockdownActive() (e.g. suspiciousAccount
 *     uses this to flag joins more aggressively during an active raid)
 *   - the caller (bot/events/guildMemberAdd.js) can use to decide whether
 *     to apply a real Discord-side response (e.g. temporarily raising
 *     verification level)
 *
 * Like antiSpam, this module only detects and recommends - it never
 * changes guild settings itself. That keeps the "is this actually a good
 * idea to do automatically" decision in the event handler, where it's
 * visible, not buried in detection logic.
 */

const { RateTracker } = require('../utils/rateTracker');
const { getGuildConfig } = require('../config/guildConfig');
const { SEVERITY } = require('../config/defaults');
const threatManager = require('./threatManager');

const joinTracker = new RateTracker();

/** @type {Map<string, number>} guildId -> lockdown expiry timestamp (ms) */
const activeLockdowns = new Map();

/**
 * @param {string} guildId
 * @returns {boolean}
 */
function isLockdownActive(guildId) {
    const expiresAt = activeLockdowns.get(guildId);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
        activeLockdowns.delete(guildId);
        return false;
    }
    return true;
}

/**
 * Checks a new guild join against the raid threshold. Call this from
 * bot/events/guildMemberAdd.js for every join.
 *
 * @param {import('discord.js').GuildMember} member
 * @returns {Promise<{ isRaid: boolean, lockdownRecommended: boolean, joinCount?: number }>}
 */
async function checkJoin(member) {
    const resolvedConfig = getGuildConfig(member.guild.id);
    const config = resolvedConfig.antiRaid;
    if (!config.enabled) return { isRaid: false, lockdownRecommended: false };

    const joinCount = joinTracker.record(member.guild.id, config.timeWindowMs);

    if (joinCount <= config.joinThreshold) {
        return { isRaid: false, lockdownRecommended: false };
    }

    const wasAlreadyActive = isLockdownActive(member.guild.id);
    activeLockdowns.set(member.guild.id, Date.now() + config.lockdownDurationMs);

    const reason = `${joinCount} members joined within ${config.timeWindowMs}ms (limit: ${config.joinThreshold})`;

    await threatManager.reportThreat({
        guild: member.guild,
        user: null,
        module: 'antiRaid',
        type: 'RAID_DETECTED',
        severity: SEVERITY.CRITICAL,
        reason,
        metadata: { joinCount },
        resolvedConfig,
    });

    // Only announce "lockdown enabled" once per lockdown window, not on
    // every single join while it's already active.
    if (!wasAlreadyActive) {
        await threatManager.reportThreat({
            guild: member.guild,
            user: null,
            module: 'antiRaid',
            type: 'LOCKDOWN_ENABLED',
            severity: SEVERITY.CRITICAL,
            reason: `Lockdown enabled for ${config.lockdownDurationMs / 60000} minutes`,
            metadata: { lockdownDurationMs: config.lockdownDurationMs },
            resolvedConfig,
        });
    }

    return { isRaid: true, lockdownRecommended: true, joinCount };
}

/** Removes stale join-tracking data. Safe to call on an interval. */
function cleanup() {
    joinTracker.cleanup();
    const now = Date.now();
    for (const [guildId, expiresAt] of activeLockdowns.entries()) {
        if (now > expiresAt) activeLockdowns.delete(guildId);
    }
}

module.exports = { checkJoin, isLockdownActive, cleanup };

