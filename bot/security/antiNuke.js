/**
 * Sentinel-X - Anti-Nuke
 * -------------------------------------
 * Watches for the classic "server nuke" pattern: an admin (often a
 * compromised account or a malicious insider) rapidly deleting/creating
 * channels and roles, or granting dangerous permissions. Uses the audit
 * log (via logging/auditLogs.js) to attribute each action to an executor,
 * then tracks per-executor action counts with the same RateTracker every
 * other module uses.
 *
 * Punishment is NEVER auto-applied here, even when autoPunishExecutor is
 * enabled in config - this module only prepares a punishment hook
 * (a plain description of what could be done) for the caller to act on.
 * A false positive here (banning an innocent admin) is far more damaging
 * than a false positive in message moderation, so the bar for this module
 * taking action itself is "never, by design."
 */

const { RateTracker } = require('../utils/rateTracker');
const { getGuildConfig } = require('../config/guildConfig');
const { SEVERITY } = require('../config/defaults');
const { isExemptFromModeration } = require('../utils/permissions');
const threatManager = require('./threatManager');
const auditLogs = require('../logging/auditLogs');
const { AuditLogEvent, PermissionsBitField } = require('discord.js');

const actionTracker = new RateTracker();

/**
 * Prepares (but never executes) a punishment recommendation for an
 * executor who tripped a threshold.
 * @param {import('discord.js').Guild} guild
 * @param {string} executorId
 * @param {string} reason
 */
function preparePunishmentHook(guild, executorId, reason) {
    return {
        guildId: guild.id,
        executorId,
        recommendedActions: ['strip_dangerous_roles', 'timeout', 'ban'],
        reason,
        // Deliberately not executed here - see module header. A future
        // moderation-action executor (or a human admin) decides whether
        // and how to apply this.
        prepared: true,
    };
}

/**
 * Shared core: resolves the executor via audit log, tracks their action
 * count, and reports/prepares a hook if they've crossed the threshold.
 * Every specific handler below (channel delete, role create, etc.) calls
 * this instead of re-implementing the same tracking logic.
 *
 * @param {import('discord.js').Guild} guild
 * @param {number} auditLogEventType
 * @param {string} targetId
 * @param {{ actionType: string, thresholdKey: string, alertType: string }} meta
 */
async function trackAndEvaluate(guild, auditLogEventType, targetId, meta) {
    const resolvedConfig = getGuildConfig(guild.id);
    const config = resolvedConfig.antiNuke;
    if (!config.enabled) return null;

    const executor = await auditLogs.resolveExecutor(guild, auditLogEventType, targetId);
    if (!executor) return null;

    const executorMember = await guild.members.fetch(executor.id).catch(() => null);
    if (isExemptFromModeration(executorMember)) return null; // owner/admins exempt by design

    const key = `${guild.id}:${executor.id}:${meta.actionType}`;
    const count = actionTracker.record(key, config.timeWindowMs);
    const threshold = config[meta.thresholdKey];

    if (count <= threshold) return null;

    const reason = `${executor.tag} performed ${count}x ${meta.actionType} within ${config.timeWindowMs}ms (limit: ${threshold})`;

    await threatManager.reportThreat({
        guild,
        user: executor,
        module: 'antiNuke',
        type: meta.alertType,
        severity: SEVERITY.CRITICAL,
        reason,
        metadata: { actionCount: count, actionType: meta.actionType },
        resolvedConfig,
    });

    await auditLogs.recordAuditEntry(guild, resolvedConfig, {
        action: 'Anti-Nuke Triggered',
        executor,
        target: meta.actionType,
        details: reason,
    });

    const hook = preparePunishmentHook(guild, executor.id, reason);
    return { triggered: true, executor, hook, autoPunishEnabled: !!config.autoPunishExecutor };
}

/** @param {import('discord.js').GuildChannel} channel */
async function handleChannelDelete(channel) {
    if (!channel.guild) return null;
    return trackAndEvaluate(channel.guild, AuditLogEvent.ChannelDelete, channel.id, {
        actionType: 'channel delete',
        thresholdKey: 'maxChannelDeletes',
        alertType: 'MASS_CHANNEL_DELETE',
    });
}

/** @param {import('discord.js').GuildChannel} channel */
async function handleChannelCreate(channel) {
    if (!channel.guild) return null;
    return trackAndEvaluate(channel.guild, AuditLogEvent.ChannelCreate, channel.id, {
        actionType: 'channel create',
        thresholdKey: 'maxChannelCreates',
        alertType: 'MASS_CHANNEL_CREATE',
    });
}

/** @param {import('discord.js').Role} role */
async function handleRoleDelete(role) {
    return trackAndEvaluate(role.guild, AuditLogEvent.RoleDelete, role.id, {
        actionType: 'role delete',
        thresholdKey: 'maxRoleDeletes',
        alertType: 'MASS_ROLE_DELETE',
    });
}

/** @param {import('discord.js').Role} role */
async function handleRoleCreate(role) {
    return trackAndEvaluate(role.guild, AuditLogEvent.RoleCreate, role.id, {
        actionType: 'role create',
        thresholdKey: 'maxRoleCreates',
        alertType: 'MASS_ROLE_CREATE',
    });
}

/**
 * Detects permission abuse: a role newly gaining Administrator that didn't
 * have it before. Reported immediately (no rate threshold) since granting
 * Administrator even once is worth an admin's attention.
 * @param {import('discord.js').Role} oldRole
 * @param {import('discord.js').Role} newRole
 */
async function handleRoleUpdate(oldRole, newRole) {
    const guild = newRole.guild;
    const resolvedConfig = getGuildConfig(guild.id);
    const config = resolvedConfig.antiNuke;
    if (!config.enabled) return null;

    const gainedAdmin =
        !oldRole.permissions.has(PermissionsBitField.Flags.Administrator) &&
        newRole.permissions.has(PermissionsBitField.Flags.Administrator);

    if (!gainedAdmin) return null;

    const executor = await auditLogs.resolveExecutor(guild, AuditLogEvent.RoleUpdate, newRole.id);
    const executorMember = executor ? await guild.members.fetch(executor.id).catch(() => null) : null;
    if (isExemptFromModeration(executorMember)) return null;

    const reason = `Role "${newRole.name}" was granted Administrator permission`;

    await threatManager.reportThreat({
        guild,
        user: executor,
        module: 'antiNuke',
        type: 'PERMISSION_ABUSE',
        severity: SEVERITY.CRITICAL,
        reason,
        metadata: { roleId: newRole.id, roleName: newRole.name },
        resolvedConfig,
    });

    await auditLogs.recordAuditEntry(guild, resolvedConfig, {
        action: 'Permission Abuse Detected',
        executor,
        target: newRole.name,
        details: reason,
    });

    return { triggered: true, executor, hook: preparePunishmentHook(guild, executor?.id, reason) };
}

module.exports = {
    handleChannelDelete,
    handleChannelCreate,
    handleRoleDelete,
    handleRoleCreate,
    handleRoleUpdate,
};

