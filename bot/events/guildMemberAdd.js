/**
 * Sentinel-X - guildMemberAdd event handler
 * -------------------------------------
 * Wires bot/security/antiRaid.js's detection to a real, reversible Discord
 * response: temporarily raising the guild's verification level during an
 * active raid, and (only if explicitly enabled) kicking very-new accounts
 * that join while a raid lockdown is active.
 *
 * Verification level was chosen for the automatic lockdown response
 * specifically because it's non-destructive and self-reverting - unlike
 * banning or channel/permission changes, it can't itself cause damage if
 * the detection turns out to be a false positive.
 */

const { GuildVerificationLevel } = require('discord.js');
const logger = require('../logger');
const { getGuildConfig, isActionAllowed } = require('../config/guildConfig');
const antiRaid = require('../security/antiRaid');

// guildId -> pending revert timer, so repeated raid detections extend the
// lockdown instead of letting an earlier timer revert it early.
const lockdownRestoreTimers = new Map();

/**
 * Temporarily raises verification level to High (if not already stricter),
 * scheduling an automatic revert after the configured lockdown duration.
 * @param {import('discord.js').Guild} guild
 * @param {number} durationMs
 */
async function applyTemporaryLockdown(guild, durationMs) {
    try {
        if (!guild.members.me?.permissions?.has('ManageGuild')) {
            logger.logWarn(`Cannot apply raid lockdown in "${guild.name}" - missing Manage Server permission`);
            return;
        }

        const previousLevel = guild.verificationLevel;
        const alreadyStrict = previousLevel === GuildVerificationLevel.High
            || previousLevel === GuildVerificationLevel.VeryHigh;

        if (!alreadyStrict) {
            await guild.setVerificationLevel(GuildVerificationLevel.High, 'Sentinel-X: raid detected, temporary lockdown');
        }

        // Reset any existing revert timer for this guild before scheduling a
        // new one, so back-to-back raid waves keep extending the lockdown.
        if (lockdownRestoreTimers.has(guild.id)) {
            clearTimeout(lockdownRestoreTimers.get(guild.id));
        }

        const timer = setTimeout(async () => {
            lockdownRestoreTimers.delete(guild.id);
            if (alreadyStrict) return; // verification level was already this strict before we touched it

            try {
                await guild.setVerificationLevel(previousLevel, 'Sentinel-X: raid lockdown expired');
            } catch (error) {
                logger.logWarn(`Failed to revert verification level for "${guild.name}": ${error.message}`);
            }
        }, durationMs);
        timer.unref?.(); // never block a graceful shutdown on a pending lockdown revert

        lockdownRestoreTimers.set(guild.id, timer);
    } catch (error) {
        logger.logWarn(`Failed to apply raid lockdown for "${guild.name}": ${error.message}`);
    }
}

/** Kicks a member, ignoring permission errors. */
async function safeKick(member, reason) {
    try {
        if (!member.kickable) return false;
        await member.kick(reason);
        return true;
    } catch (error) {
        logger.logWarn(`Failed to kick ${member.user?.tag}: ${error.message}`);
        return false;
    }
}

/**
 * @param {import('discord.js').GuildMember} member
 */
async function handleGuildMemberAdd(member) {
    try {
        const resolvedConfig = getGuildConfig(member.guild.id, member.guild.name);

        const raidResult = await antiRaid.checkJoin(member);

        if (raidResult.lockdownRecommended && isActionAllowed(resolvedConfig.antiRaid, 'lockdown')) {
            await applyTemporaryLockdown(member.guild, resolvedConfig.antiRaid.lockdownDurationMs);
        }

        // While a lockdown is active, optionally remove very-new accounts
        // joining during it - off by default (see shared/guildConfigStore.js
        // SECURITY_ACTIONS.antiRaid.kickNewAccounts), since auto-kicking
        // legitimate new members during a false-positive is a real cost.
        if (antiRaid.isLockdownActive(member.guild.id) && isActionAllowed(resolvedConfig.antiRaid, 'kickNewAccounts')) {
            const accountAgeMs = Date.now() - member.user.createdTimestamp;
            if (accountAgeMs < resolvedConfig.suspiciousAccount.minAccountAgeMs) {
                await safeKick(member, 'Sentinel-X: new account joined during active raid lockdown');
            }
        }
    } catch (error) {
        logger.logError('Unhandled error in guildMemberAdd handler', error);
    }
}

module.exports = handleGuildMemberAdd;

