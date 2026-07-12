/**
 * Sentinel-X - Security Logs
 * -------------------------------------
 * Subscribes to bot/security/threatManager.js's 'threat' event and turns
 * each threat into a formatted embed in the guild's configured
 * security-logs channel. This is the ONLY module that posts threat alerts
 * to Discord - detection modules never talk to channels directly, they
 * just call threatManager.reportThreat() and this module handles the rest.
 *
 * Call init() once at bot startup (see bot/index.js) to attach the listener.
 */

const threatManager = require('../security/threatManager');
const { buildLogEmbed } = require('../utils/embeds');
const { sendToLogChannel } = require('../utils/logChannel');

// Human-friendly titles for known alert types. Unrecognized types still log
// fine - they just use the raw type string as the title.
const TYPE_TITLES = {
    MESSAGE_FLOOD: 'Spam Detected',
    SUSPICIOUS_LINK: 'Link Blocked',
    DISCORD_INVITE: 'Invite Link Blocked',
    MASS_MENTION: 'Mention Spam',
    EVERYONE_MENTION_ABUSE: 'Mass Mention Abuse',
    EXCESSIVE_CAPS: 'Excessive Caps',
    EMOJI_FLOOD: 'Emoji Spam',
    RAID_DETECTED: 'Raid Detected',
    LOCKDOWN_ENABLED: 'Lockdown Enabled',
    MASS_CHANNEL_DELETE: 'Anti-Nuke Triggered',
    MASS_CHANNEL_CREATE: 'Anti-Nuke Triggered',
    MASS_ROLE_DELETE: 'Anti-Nuke Triggered',
    MASS_ROLE_CREATE: 'Anti-Nuke Triggered',
    WEBHOOK_FLOOD: 'Webhook Abuse',
    SUSPICIOUS_ACCOUNT: 'Suspicious Account Detected',
};

let initialized = false;

/**
 * Attaches the security-log listener to the shared threatManager instance.
 * Safe to call multiple times - only attaches once.
 */
function init() {
    if (initialized) return;
    initialized = true;

    threatManager.on('threat', async (event) => {
        const { guild, user, module: moduleName, type, severity, reason, metadata, resolvedConfig } = event;

        if (!guild || !resolvedConfig) return;

        const embed = buildLogEmbed({
            title: TYPE_TITLES[type] || type,
            description: reason,
            severity,
            user,
            fields: [
                { name: 'Module', value: moduleName, inline: true },
                { name: 'Severity', value: severity, inline: true },
                ...Object.entries(metadata || {}).map(([name, value]) => ({
                    name,
                    value: String(value),
                    inline: true,
                })),
            ],
        });

        await sendToLogChannel(guild, 'securityLogs', resolvedConfig, embed);
    });
}

module.exports = { init };
