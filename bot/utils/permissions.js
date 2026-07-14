/**
 * Sentinel-X - Permission Helpers
 * -------------------------------------
 * Small, dependency-free helpers for checking member permissions. Kept
 * separate so detection modules don't each re-derive PermissionsBitField
 * logic slightly differently.
 */

const { PermissionsBitField } = require('discord.js');

/**
 * Whether a guild member has Administrator permission.
 * @param {import('discord.js').GuildMember} member
 */
function isAdministrator(member) {
    return !!member?.permissions?.has(PermissionsBitField.Flags.Administrator);
}

/**
 * Whether a guild member should be exempt from automated moderation -
 * administrators and the guild owner are never auto-punished by Sentinel-X,
 * since false positives against staff are the most disruptive kind.
 * @param {import('discord.js').GuildMember} member
 */
function isExemptFromModeration(member) {
    if (!member) return false;
    if (member.id === member.guild?.ownerId) return true;
    if (isAdministrator(member)) return true;
    return false;
}

/**
 * Whether the bot itself has a given permission in a guild, checked before
 * attempting an action that would otherwise throw.
 * @param {import('discord.js').Guild} guild
 * @param {bigint} permissionFlag - e.g. PermissionsBitField.Flags.ManageMessages
 */
function botHasPermission(guild, permissionFlag) {
    const me = guild?.members?.me;
    return !!me?.permissions?.has(permissionFlag);
}

module.exports = {
    isAdministrator,
    isExemptFromModeration,
    botHasPermission,
};

