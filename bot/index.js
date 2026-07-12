/**
 * Sentinel-X - Advanced Discord Security Bot
 * -------------------------------------------------
 * Entry point: handles Discord client setup, startup, and message-level
 * security enforcement. All detection logic lives in security.js, and all
 * logging lives in logger.js, so this file stays focused on bot behavior.
 */

require('dotenv').config();

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { AntiSpam, AntiLink } = require('./security');
const logger = require('./logger');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
    logger.logError('DISCORD_TOKEN is missing. Set it in your environment variables (.env on local, dashboard on Render).');
    process.exit(1);
}

const SPAM_MAX_MESSAGES = Number(process.env.SPAM_MAX_MESSAGES) || 5;
const SPAM_TIME_WINDOW_MS = Number(process.env.SPAM_TIME_WINDOW_MS) || 5000;

// Comma-separated list of whitelisted domains, e.g. "youtube.com,github.com"
const LINK_WHITELIST = (process.env.LINK_WHITELIST || '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);

// ---------------------------------------------------------------------------
// Client setup
// ---------------------------------------------------------------------------

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Message, Partials.Channel],
});

// Security engines
const antiSpam = new AntiSpam({
    maxMessages: SPAM_MAX_MESSAGES,
    timeWindowMs: SPAM_TIME_WINDOW_MS,
});

const antiLink = new AntiLink({
    whitelist: LINK_WHITELIST,
});

// Periodically clean up stale spam-tracking data to avoid memory growth
setInterval(() => antiSpam.cleanup(), 60_000).unref();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely deletes a message, ignoring permission/already-deleted errors.
 * @param {import('discord.js').Message} message
 * @returns {Promise<boolean>} whether the delete succeeded
 */
async function safeDeleteMessage(message) {
    try {
        if (message.deletable) {
            await message.delete();
            return true;
        }
        return false;
    } catch (error) {
        logger.logWarn(
            `Could not delete message from ${message.author?.tag || message.author?.id} in "${message.guild?.name}": ${error.message}`
        );
        return false;
    }
}

/**
 * Safely sends a warning to the channel, ignoring permission errors.
 * @param {import('discord.js').Message} message
 * @param {string} content
 */
async function safeWarn(message, content) {
    try {
        const warning = await message.channel.send(content);
        // Auto-remove the warning after a few seconds to keep the channel clean
        setTimeout(() => {
            warning.delete().catch(() => {
                // Ignore if it was already deleted or permissions changed
            });
        }, 8000);
    } catch (error) {
        logger.logWarn(
            `Could not send warning message in "${message.guild?.name}" / #${message.channel?.name}: ${error.message}`
        );
    }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

client.once('ready', () => {
    logger.logInfo(`Sentinel-X is online as ${client.user.tag}`);
    logger.logInfo(`Guarding ${client.guilds.cache.size} server(s)`);
});

client.on('messageCreate', async (message) => {
    try {
        // Ignore bots and system messages, and only moderate guild messages
        if (message.author?.bot || !message.guild) return;

        // --- Anti-Spam check ---
        const spamResult = antiSpam.checkMessage(message.author.id);
        if (spamResult.isSpam) {
            await handleThreat(message, 'SPAM', spamResult.reason, 'You are sending messages too quickly. Please slow down.');
            return;
        }

        // --- Anti-Link check ---
        const linkResult = antiLink.checkMessage(message.content);
        if (linkResult.hasSuspiciousLink) {
            await handleThreat(message, 'LINK', linkResult.reason, 'Posting unapproved links is not allowed here.');
            return;
        }
    } catch (error) {
        logger.logError('Unhandled error while processing message', error);
    }
});

/**
 * Central threat-response pipeline: delete, warn, log.
 * Each step is isolated so a failure in one (e.g. missing permissions)
 * never prevents the others from running.
 *
 * @param {import('discord.js').Message} message
 * @param {string} type - "SPAM" | "LINK"
 * @param {string} reason
 * @param {string} warningText
 */
async function handleThreat(message, type, reason, warningText) {
    await safeDeleteMessage(message);
    await safeWarn(message, `⚠️ ${message.author}, ${warningText}`);

    logger.logSecurityEvent({
        guild: message.guild,
        user: message.author,
        type,
        reason,
    });
}

// ---------------------------------------------------------------------------
// Global error handling (prevents the process from crashing on unexpected errors)
// ---------------------------------------------------------------------------

client.on('error', (error) => {
    logger.logError('Discord client error', error);
});

process.on('unhandledRejection', (error) => {
    logger.logError('Unhandled promise rejection', error);
});

process.on('uncaughtException', (error) => {
    logger.logError('Uncaught exception', error);
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

client.login(TOKEN).catch((error) => {
    logger.logError('Failed to log in to Discord. Check that DISCORD_TOKEN is valid.', error);
    process.exit(1);
});
