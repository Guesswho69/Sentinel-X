/**
 * Sentinel-X - Anti-Link
 * -------------------------------------
 * Detects URLs in message content, checks them against a per-guild
 * whitelist, and delegates Discord-invite detection to antiInvite.js
 * rather than re-implementing that regex here.
 *
 * "Malicious link detection" is intentionally a pluggable structure, not a
 * hardcoded blocklist check against a live threat-intel API - wiring in a
 * real provider (Google Safe Browsing, VirusTotal, etc.) is future work
 * that only needs to fill in isKnownMaliciousDomain() below.
 */

const { getGuildConfig } = require('../config/guildConfig');
const { SEVERITY } = require('../config/defaults');
const threatManager = require('./threatManager');
const antiInvite = require('./antiInvite');

const URL_REGEX = /(?:https?:\/\/[^\s]+)|(?:\bwww\.[^\s]+)/gi;

/**
 * Extracts all URLs found in a message string.
 * @param {string} content
 * @returns {string[]}
 */
function extractLinks(content) {
    if (!content) return [];
    const matches = content.match(URL_REGEX);
    return matches || [];
}

/**
 * @param {string} url
 * @returns {string|null} the lowercased hostname, or null if unparseable
 */
function getHostname(url) {
    try {
        const normalized = url.startsWith('http') ? url : `http://${url}`;
        return new URL(normalized).hostname.toLowerCase();
    } catch {
        return null;
    }
}

/**
 * @param {string} hostname
 * @param {string[]} whitelist
 */
function isWhitelisted(hostname, whitelist) {
    if (!hostname) return false;
    return whitelist.some((domain) => hostname === domain.toLowerCase() || hostname.endsWith(`.${domain.toLowerCase()}`));
}

/**
 * Structural placeholder for real threat-intel integration. Currently
 * checks against a guild-configurable blocklist array; a future version
 * can replace the body with an API call without changing the call site.
 * @param {string} hostname
 * @param {string[]} blocklist
 */
function isKnownMaliciousDomain(hostname, blocklist) {
    if (!hostname || !blocklist || blocklist.length === 0) return false;
    return blocklist.some((domain) => hostname === domain.toLowerCase() || hostname.endsWith(`.${domain.toLowerCase()}`));
}

/**
 * @param {import('discord.js').Message} message
 * @returns {Promise<{ isViolation: boolean, reason?: string, links?: string[] }>}
 */
async function checkMessage(message) {
    const resolvedConfig = getGuildConfig(message.guild.id);
    const config = resolvedConfig.antiLink;
    if (!config.enabled) return { isViolation: false };

    // Discord invites are handled by antiInvite - avoid double-detecting
    // and double-reporting the same link as both a "link" and an "invite".
    if (config.blockDiscordInvites) {
        const inviteResult = await antiInvite.checkMessage(message);
        if (inviteResult.isViolation) {
            return { isViolation: true, reason: inviteResult.reason, links: [] };
        }
    }

    const links = extractLinks(message.content);
    if (links.length === 0) return { isViolation: false };

    const flagged = [];
    for (const link of links) {
        const hostname = getHostname(link);

        if (isWhitelisted(hostname, config.whitelist)) continue;

        if (isKnownMaliciousDomain(hostname, config.maliciousDomainBlocklist)) {
            flagged.push({ link, hostname, malicious: true });
            continue;
        }

        // Any non-whitelisted link is flagged by default - this module
        // treats anti-link as an allowlist system, not a denylist one,
        // since that's the safer default for a security bot.
        flagged.push({ link, hostname, malicious: false });
    }

    if (flagged.length === 0) return { isViolation: false };

    const hasMalicious = flagged.some((f) => f.malicious);
    const reason = hasMalicious
        ? `Message contained a known-malicious link`
        : `Message contained ${flagged.length} non-whitelisted link(s)`;

    await threatManager.reportThreat({
        guild: message.guild,
        user: message.author,
        module: 'antiLink',
        type: 'SUSPICIOUS_LINK',
        severity: hasMalicious ? SEVERITY.HIGH : SEVERITY.LOW,
        reason,
        metadata: { linkCount: flagged.length },
        resolvedConfig,
    });

    return { isViolation: true, reason, links: flagged.map((f) => f.link) };
}

module.exports = { checkMessage, extractLinks, isWhitelisted, isKnownMaliciousDomain };
