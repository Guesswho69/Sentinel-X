/**
 * Sentinel-X - Audit Logs
 * -------------------------------------
 * Two responsibilities:
 *   1. resolveExecutor() - the ONE place that fetches Discord's audit log
 *      to figure out which moderator/admin performed a sensitive action.
 *      antiNuke.js, antiWebhook.js, serverLogs.js, and moderationLogs.js
 *      all call this instead of each re-implementing audit log fetching.
 *   2. recordAuditEntry() - posts a generic "X did Y to Z" embed to the
 *      guild's audit-logs channel, giving admins one place that shows
 *      attribution across every category (server changes, moderation
 *      actions, security triggers) instead of hunting through Discord's
 *      own audit log UI.
 */

const { buildLogEmbed } = require('../utils/embeds');
const { sendToLogChannel } = require('../utils/logChannel');

// How recent an audit log entry must be to be trusted as "the" executor
// for a given event - protects against attributing an action to the wrong
// person if two similar actions happen close together.
const MAX_ATTRIBUTION_AGE_MS = 5000;

/**
 * Looks up the most recent audit log entry of a given type targeting a
 * specific ID, and returns the user who performed it (if found recently
 * enough to trust the attribution).
 *
 * @param {import('discord.js').Guild} guild
 * @param {number} auditLogEventType - a discord.js AuditLogEvent value
 * @param {string} [targetId] - only match entries targeting this ID, if provided
 * @returns {Promise<import('discord.js').User|null>}
 */
async function resolveExecutor(guild, auditLogEventType, targetId) {
    try {
        if (!guild?.members?.me?.permissions?.has('ViewAuditLog')) {
            return null;
        }

        const logs = await guild.fetchAuditLogs({ type: auditLogEventType, limit: 5 });
        const entry = logs.entries.find((e) => {
            const matchesTarget = targetId ? e.targetId === targetId : true;
            const isRecent = Date.now() - e.createdTimestamp <= MAX_ATTRIBUTION_AGE_MS;
            return matchesTarget && isRecent;
        });

        return entry?.executor || null;
    } catch (error) {
        console.error('[Sentinel-X] Failed to resolve audit log executor:', error.message);
        return null;
    }
}

/**
 * Posts a generic audit-trail embed. Best-effort: never throws, since
 * losing an audit-trail post should never break the caller's own logic.
 *
 * @param {import('discord.js').Guild} guild
 * @param {Object} resolvedConfig - the guild's resolved config
 * @param {Object} entry
 * @param {string} entry.action - e.g. "Channel Deleted", "Role Created"
 * @param {import('discord.js').User|null} [entry.executor]
 * @param {string} [entry.target] - human-readable description of what was affected
 * @param {string} [entry.details]
 */
async function recordAuditEntry(guild, resolvedConfig, entry) {
    if (!guild || !resolvedConfig) return;
    if (resolvedConfig.logging?.enabledCategories?.auditLogs === false) return;

    const embed = buildLogEmbed({
        title: entry.action,
        description: entry.details,
        fields: [
            { name: 'Performed by', value: entry.executor ? `${entry.executor.tag} (${entry.executor.id})` : 'Unknown', inline: true },
            ...(entry.target ? [{ name: 'Target', value: entry.target, inline: true }] : []),
        ],
    });

    await sendToLogChannel(guild, 'auditLogs', resolvedConfig, embed);
}

module.exports = { resolveExecutor, recordAuditEntry };

