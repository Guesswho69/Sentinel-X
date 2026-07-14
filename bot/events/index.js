/**
 * Sentinel-X - Event Registration
 * -------------------------------------
 * Single place that wires discord.js client events to their handlers, so
 * bot/index.js stays a lightweight bootstrap file instead of growing a
 * pile of client.on(...) calls itself. Add a new event by adding one
 * require + one client.on() line here.
 */

const messageCreate = require('./messageCreate');

/**
 * @param {import('discord.js').Client} client
 */
function registerEvents(client) {
    client.on('messageCreate', messageCreate);
}

module.exports = registerEvents;

