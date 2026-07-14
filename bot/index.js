/**
 * Sentinel-X - Advanced Discord Security Bot
 * -------------------------------------------------
 * Entry point: Discord client setup and startup only. All detection logic
 * lives in bot/security/*.js, all Discord-side actions (delete, timeout,
 * warn, purge) live in bot/events/*.js, and all logging lives in
 * bot/logging/*.js - this file just wires the client together and starts it.
 */

require('dotenv').config();

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const logger = require('./logger');
const securityLogs = require('./logging/securityLogs');
const registerEvents = require('./events');

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
    logger.logError('DISCORD_TOKEN is missing. Set it in your environment variables (.env on local, dashboard on Render).');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildWebhooks,
    ],
    partials: [Partials.Message, Partials.Channel],
});

// Attaches the listener that turns threatManager alerts into Discord embeds
// posted to each guild's security-logs channel.
securityLogs.init();

// Wires every discord.js client event to its handler (see bot/events/index.js).
registerEvents(client);

client.once('ready', () => {
    logger.logInfo(`Sentinel-X is online as ${client.user.tag}`);
    logger.logInfo(`Guarding ${client.guilds.cache.size} server(s)`);
});

client.on('error', (error) => {
    logger.logError('Discord client error', error);
});

process.on('unhandledRejection', (error) => {
    logger.logError('Unhandled promise rejection', error);
});

process.on('uncaughtException', (error) => {
    logger.logError('Uncaught exception', error);
});

client.login(TOKEN).catch((error) => {
    logger.logError('Failed to log in to Discord. Check that DISCORD_TOKEN is valid.', error);
    process.exit(1);
});
