/**
 * Sentinel-X - Anti-Invite
 * -------------------------------------
 * Detects Discord server invite links in message content. Exposed both as
 * its own standalone check AND as a shared detector that antiLink.js calls
 * into - invite-link detection is written exactly once here, per the
 * "no duplicated logic" requirement.
 */

const { getGuildConfig } = require('../config/guildConfig');
const { SEVERITY } = require('../config/defaults');
const threatManager = require('./threatManager');

// Matches discord.gg/xxxx, discord.com/invite/xxxx, and discordapp.com/invite/xxxx
const INVITE_REGEX = /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)([a-zA-Z0-9-]+)/gi;

/**
 * Extracts invite codes from message content.
 * @param {string} content
 * @returns {string[]} invite codes (not full URLs)
 */
function extractInviteCodes(content) {
    if (!content) return [];
    const codes = [];
    let match;
    // Reset lastIndex since INVITE_REGEX is a shared global-flag regex
    INVITE_REGEX.lastIndex = 0;
    while ((match = INVITE_REGEX.exec(content)) !== null) {
        codes.push(match[1]);
    }
    return codes;
}

/**
 * Checks message content for non-whitelisted Discord invites.
 * This is the shared detector - antiLink.js calls this directly.
 *
 * @param {string} content
 * @param {Object} antiInviteConfig - resolvedConfig.antiInvite for the guild
 * @param {string} [ownGuildVanityCode] - the guild's own invite code, if known,
 *   always allowed when allowOwnServerInvites is true
 * @returns {{ hasInvite: boolean, blockedCodes: string[] }}
 */
function detectInvites(content, antiInviteConfig, ownGuildVanityCode) {
    const codes = extractInviteCodes(content);
    if (codes.length === 0) return { hasInvite: false, blockedCodes: [] };

    const whitelist = new Set((antiInviteConfig.whitelistedInviteCodes || []).map((c) => c.toLowerCase()));
    if (antiInviteConfig.allowOwnServerInvites && ownGuildVanityCode) {
        whitelist.add(ownGuildVanityCode.toLowerCase());
    }

    const blockedCodes = codes.filter((code) => !whitelist.has(code.toLowerCase()));

    return { hasInvite: blockedCodes.length > 0, blockedCodes };
}

/**
 * Standalone check for use directly against a message (when antiLink is
 * disabled but antiInvite should still run on its own).
 * @param {import('discord.js').Message} message
 */
async function checkMessage(message) {
    const resolvedConfig = getGuildConfig(message.guild.id);
    const config = resolvedConfig.antiInvite;
    if (!config.enabled) return { isViolation: false };

    const vanityCode = message.guild.vanityURLCode || null;
    const { hasInvite, blockedCodes } = detectInvites(message.content, config, vanityCode);

    if (!hasInvite) return { isViolation: false };

    const reason = `Message contained ${blockedCodes.length} non-whitelisted Discord invite(s)`;

    await threatManager.reportThreat({
        guild: message.guild,
        user: message.author,
        module: 'antiInvite',
        type: 'DISCORD_INVITE',
        severity: SEVERITY.MEDIUM,
        reason,
        metadata: { blockedCodes: blockedCodes.join(', ') },
        resolvedConfig,
    });

    return { isViolation: true, reason, blockedCodes };
}

module.exports = { checkMessage, detectInvites, extractInviteCodes };

