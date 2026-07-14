/**
 * Sentinel-X - Event Registration
 * -------------------------------------
 * Single place that wires discord.js client events to their handlers, so
 * bot/index.js stays a lightweight bootstrap file instead of growing a
 * pile of client.on(...) calls itself. Add a new event by adding one
 * require + one client.on() line here.
 */

const messageCreate = require('./messageCreate');
const guildMemberAdd = require('./guildMemberAdd');
const channelCreate = require('./channelCreate');
const channelDelete = require('./channelDelete');
const roleCreate = require('./roleCreate');
const roleDelete = require('./roleDelete');
const roleUpdate = require('./roleUpdate');
const webhooksUpdate = require('./webhooksUpdate');

/**
 * @param {import('discord.js').Client} client
 */
function registerEvents(client) {
    client.on('messageCreate', messageCreate);
    client.on('guildMemberAdd', guildMemberAdd);
    client.on('channelCreate', channelCreate);
    client.on('channelDelete', channelDelete);
    client.on('roleCreate', roleCreate);
    client.on('roleDelete', roleDelete);
    client.on('roleUpdate', roleUpdate);
    client.on('webhooksUpdate', webhooksUpdate);
}

module.exports = registerEvents;
