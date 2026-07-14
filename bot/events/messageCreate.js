/**
 * Sentinel-X - messageCreate event handler
 * -------------------------------------
 * This is the piece that was missing: every security module in
 * bot/security/*.js only detects and recommends - this file is what
 * actually calls message.delete(), applies timeouts, sends warnings, etc.,
 * gated by each module's per-action toggles (config.<module>.actionsAllowed).
 *
 * Checks run in order and stop at the first violation, so one message never
 * triggers two modules' worth of actions on top of each other.
 */

const logger = require('../logger');
const { getGuildConfig, isActionAllowed } = require('../config/guildConfig');
const antiSpam = require('../security/antiSpam');
const antiLink = require('../security/antiLink');
const antiMention = require('../security/antiMention');
const antiCaps = require('../security/antiCaps');
const antiEmojiSpam = require('../security/antiEmojiSpam');

const BULK_DELETE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // Discord's bulkDelete age limit

/** Deletes a message, ignoring permission/already-deleted errors. */
async function safeDelete(message) {
    try {
        if (message.deletable) {
            await message.delete();
            return true;
        }
        return false;
    } catch (error) {
        logger.logWarn(`Could not delete message from ${message.author?.tag}: ${error.message}`);
        return false;
    }
}

/** Sends a warning that auto-removes itself after a few seconds. */
async function safeWarn(message, content) {
    try {
        const warning = await message.channel.send(content);
        setTimeout(() => warning.delete().catch(() => {}), 8000);
    } catch (error) {
        logger.logWarn(`Could not send warning in #${message.channel?.name}: ${error.message}`);
    }
}

/**
 * Deletes every recent message from a specific user in a channel - the
 * "purge the spammer's messages" behavior. Respects Discord's bulkDelete
 * rules: only messages under 14 days old can be bulk-deleted, and a single
 * remaining message has to go through message.delete() instead.
 * @param {import('discord.js').TextChannel} channel
 * @param {string} userId
 * @returns {Promise<number>} how many messages were removed
 */
async function purgeUserMessages(channel, userId) {
    try {
        if (!channel.permissionsFor(channel.guild.members.me)?.has('ManageMessages')) {
            return 0;
        }

        const recentMessages = await channel.messages.fetch({ limit: 100 });
        const cutoff = Date.now() - BULK_DELETE_MAX_AGE_MS;
        const toDelete = recentMessages.filter(
            (m) => m.author.id === userId && m.createdTimestamp > cutoff
        );

        if (toDelete.size === 0) return 0;

        if (toDelete.size === 1) {
            await toDelete.first().delete().catch(() => {});
            return 1;
        }

        const deleted = await channel.bulkDelete(toDelete, true).catch((error) => {
            logger.logWarn(`Bulk delete failed in #${channel.name}: ${error.message}`);
            return null;
        });

        return deleted ? deleted.size : 0;
    } catch (error) {
        logger.logWarn(`Failed to purge messages for user in #${channel.name}: ${error.message}`);
        return 0;
    }
}

/** Applies a timeout, ignoring permission errors (e.g. target outranks the bot). */
async function applyTimeout(member, durationMs, reason) {
    try {
        if (!member || !member.moderatable || durationMs <= 0) return false;
        await member.timeout(durationMs, reason);
        return true;
    } catch (error) {
        logger.logWarn(`Failed to timeout ${member?.user?.tag}: ${error.message}`);
        return false;
    }
}

/**
 * Handles an Anti-Spam violation specifically, since it has richer
 * behavior than the other checks: delete the triggering message, purge the
 * user's other recent messages in the channel, warn, and escalate to a
 * timeout per the configured ladder.
 */
async function handleSpamViolation(message, spamResult, resolvedConfig) {
    const moduleConfig = resolvedConfig.antiSpam;

    if (isActionAllowed(moduleConfig, 'delete')) {
        await safeDelete(message);
    }

    if (isActionAllowed(moduleConfig, 'purge')) {
        const purgedCount = await purgeUserMessages(message.channel, message.author.id);
        if (purgedCount > 0) {
            logger.logInfo(`Purged ${purgedCount} message(s) from ${message.author.tag} in #${message.channel.name} (spam)`);
        }
    }

    if (isActionAllowed(moduleConfig, 'warn')) {
        await safeWarn(message, `⚠️ ${message.author}, you're sending messages too quickly - your recent messages were removed.`);
    }

    if (isActionAllowed(moduleConfig, 'timeout') && spamResult.action === 'timeout') {
        await applyTimeout(message.member, spamResult.durationMs, spamResult.reason);
    }
}

/**
 * Generic delete + warn handler shared by the message-content checks that
 * don't need Anti-Spam's extra purge/escalation behavior.
 */
async function handleGenericViolation(message, resolvedConfig, moduleName, warnText) {
    const moduleConfig = resolvedConfig[moduleName];

    if (isActionAllowed(moduleConfig, 'delete')) {
        await safeDelete(message);
    }

    if (isActionAllowed(moduleConfig, 'warn')) {
        await safeWarn(message, `⚠️ ${message.author}, ${warnText}`);
    }
}

/**
 * @param {import('discord.js').Message} message
 */
async function handleMessageCreate(message) {
    try {
        if (message.author?.bot || !message.guild) return;

        const resolvedConfig = getGuildConfig(message.guild.id, message.guild.name);

        const spamResult = await antiSpam.checkMessage(message);
        if (spamResult.isViolation) {
            await handleSpamViolation(message, spamResult, resolvedConfig);
            return;
        }

        const linkResult = await antiLink.checkMessage(message);
        if (linkResult.isViolation) {
            await handleGenericViolation(message, resolvedConfig, 'antiLink', 'links/invites are not allowed here.');
            return;
        }

        const mentionResult = await antiMention.checkMessage(message);
        if (mentionResult.isViolation) {
            await handleGenericViolation(message, resolvedConfig, 'antiMention', 'mass mentions are not allowed here.');
            return;
        }

        const capsResult = await antiCaps.checkMessage(message);
        if (capsResult.isViolation) {
            await handleGenericViolation(message, resolvedConfig, 'antiCaps', 'please avoid excessive caps.');
            return;
        }

        const emojiResult = await antiEmojiSpam.checkMessage(message);
        if (emojiResult.isViolation) {
            await handleGenericViolation(message, resolvedConfig, 'antiEmojiSpam', 'please avoid excessive emoji use.');
            return;
        }
    } catch (error) {
        logger.logError('Unhandled error in messageCreate handler', error);
    }
}

module.exports = handleMessageCreate;

