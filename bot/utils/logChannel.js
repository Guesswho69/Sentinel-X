/**
 * Sentinel-X - Log Channel Resolver
 * -------------------------------------
 * Finds the Discord channel a guild has designated for a given log type
 * (message logs, mod logs, security logs, etc). Looks the channel up by
 * name today, per the default config; if a guild's config supplies an
 * explicit channel ID instead, that takes priority.
 */

const { ChannelType } = require('discord.js');

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} logType - key into config.logging.channels, e.g. "securityLogs"
 * @param {Object} resolvedConfig - the guild's resolved config (see guildConfig.js)
 * @returns {import('discord.js').TextChannel|null}
 */
function resolveLogChannel(guild, logType, resolvedConfig) {
    if (!guild) return null;

    const channelSetting = resolvedConfig?.logging?.channels?.[logType];
    if (!channelSetting) return null;

    // Allow either an explicit channel ID or a channel name in config.
    const byId = guild.channels.cache.get(channelSetting);
    if (byId && byId.type === ChannelType.GuildText) return byId;

    const byName = guild.channels.cache.find(
        (ch) => ch.type === ChannelType.GuildText && ch.name === channelSetting
    );

    return byName || null;
}

/**
 * Sends an embed to a guild's configured log channel, silently doing
 * nothing if the channel doesn't exist or the bot lacks permission -
 * logging failures should never crash the caller.
 * @param {import('discord.js').Guild} guild
 * @param {string} logType
 * @param {Object} resolvedConfig
 * @param {import('discord.js').EmbedBuilder} embed
 */
async function sendToLogChannel(guild, logType, resolvedConfig, embed) {
    try {
        const channel = resolveLogChannel(guild, logType, resolvedConfig);
        if (!channel) return false;

        if (!channel.permissionsFor(guild.members.me)?.has('SendMessages')) {
            return false;
        }

        await channel.send({ embeds: [embed] });
        return true;
    } catch (error) {
        console.error(`[Sentinel-X] Failed to send to log channel "${logType}":`, error.message);
        return false;
    }
}

module.exports = { resolveLogChannel, sendToLogChannel };

