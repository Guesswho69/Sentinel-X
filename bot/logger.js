/**
 * Sentinel-X Security Logger
 * -------------------------------------
 * Centralized logging for all security-related events.
 * Currently logs to console with clean, structured formatting.
 * Designed to be swapped/extended later (file, database, webhook, dashboard)
 * without touching call sites elsewhere in the bot.
 */

const LEVELS = {
    INFO: 'INFO',
    WARN: 'WARN',
    THREAT: 'THREAT',
    ERROR: 'ERROR',
};

function timestamp() {
    return new Date().toISOString();
}

function formatLine(level, label, message) {
    return `[${timestamp()}] [${level}]${label ? ` [${label}]` : ''} ${message}`;
}

/**
 * Logs a security detection event (spam, links, etc.)
 *
 * @param {Object} details
 * @param {import('discord.js').Guild} [details.guild] - Guild where event occurred
 * @param {import('discord.js').User} [details.user] - User who triggered the event
 * @param {string} details.type - Detection type, e.g. "SPAM", "LINK"
 * @param {string} details.reason - Human-readable reason/details
 */
function logSecurityEvent({ guild, user, type, reason }) {
    const serverName = guild ? guild.name : 'Unknown Server';
    const userTag = user ? (user.tag || user.username || user.id) : 'Unknown User';

    const message =
        `Server: "${serverName}" | User: "${userTag}" | ` +
        `Detection: ${type}${reason ? ` | Reason: ${reason}` : ''}`;

    console.log(formatLine(LEVELS.THREAT, 'SECURITY', message));
}

/**
 * Logs a general informational message.
 * @param {string} message
 */
function logInfo(message) {
    console.log(formatLine(LEVELS.INFO, null, message));
}

/**
 * Logs a warning (non-fatal issue, e.g. missing permissions).
 * @param {string} message
 */
function logWarn(message) {
    console.warn(formatLine(LEVELS.WARN, null, message));
}

/**
 * Logs an error, including stack trace if available.
 * @param {string} message
 * @param {Error} [error]
 */
function logError(message, error) {
    console.error(formatLine(LEVELS.ERROR, null, message));
    if (error && error.stack) {
        console.error(error.stack);
    }
}

module.exports = {
    logSecurityEvent,
    logInfo,
    logWarn,
    logError,
};
