/**
 * Sentinel-X - Anti-Webhook
 * -------------------------------------
 * Detects excessive webhook creation. discord.js's `webhooksUpdate` event
 * fires on ANY webhook change in a channel (create, edit, or delete) and
 * doesn't say which happened or who did it - the audit log (via
 * logging/auditLogs.js) is used to confirm this was specifically a
 * creation and to attribute it to an executor, exactly like antiNuke.js
 * does for channel/role events.
 */

const { AuditLogEvent } = require('discord.js');
const { RateTracker } = require('../utils/rateTracker');
const { getGuildConfig } = require('../config/guildConfig');
const { SEVERITY } = require('../config/defaults');
const { isExemptFromModeration } = require('../utils/permissions');
const threatManager = require('./threatManager');
const auditLogs = require('../logging/auditLogs');

const creationTracker = new RateTracker();

/**
 * @param {import('discord.js').TextChannel} channel - the channel whose webhooks changed
 */
async function handleWebhooksUpdate(channel) {
    const guild = channel.guild;
    if (!guild) return null;

    const resolvedConfig = getGuildConfig(guild.id);
    const config = resolvedConfig.antiWebhook;
    if (!config.enabled) return null;

    // No target ID to match against here (we only know the channel, not
    // which webhook) - resolveExecutor falls back to "most recent entry of
    // this type within the attribution window", which is an acceptable
    // approximation for this use case.
    const executor = await auditLogs.resolveExecutor(guild, AuditLogEvent.WebhookCreate, undefined);
    if (!executor) return null; // wasn't a creation, or too old to attribute confidently

    const executorMember = await guild.members.fetch(executor.id).catch(() => null);
    if (isExemptFromModeration(executorMember)) return null;

    const key = `${guild.id}:${executor.id}`;
    const count = creationTracker.record(key, config.timeWindowMs);

    if (count <= config.maxWebhookCreates) return null;

    const reason = `${executor.tag} created ${count} webhook(s) within ${config.timeWindowMs}ms (limit: ${config.maxWebhookCreates})`;

    await threatManager.reportThreat({
        guild,
        user: executor,
        module: 'antiWebhook',
        type: 'WEBHOOK_FLOOD',
        severity: SEVERITY.HIGH,
        reason,
        metadata: { actionCount: count, channel: channel.name },
        resolvedConfig,
    });

    await auditLogs.recordAuditEntry(guild, resolvedConfig, {
        action: 'Anti-Webhook Triggered',
        executor,
        target: channel.name,
        details: reason,
    });

    return { triggered: true, executor, channel };
}

module.exports = { handleWebhooksUpdate };

