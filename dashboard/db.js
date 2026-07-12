/**
 * Sentinel-X Dashboard - Guild configuration store
 * -------------------------------------
 * The ONLY thing persisted here is per-guild configuration: which commands
 * and security modules are enabled. No Discord credentials, passwords, or
 * access tokens are ever written to this database.
 *
 * Uses better-sqlite3 (a single file on disk) so the foundation build has
 * no external database service to provision. Swap this module out for a
 * hosted database later without touching any route code, since routes only
 * ever call getGuildConfig / saveGuildConfig.
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'sentinel-x.db');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS guild_configs (
        guild_id TEXT PRIMARY KEY,
        guild_name TEXT,
        commands TEXT NOT NULL DEFAULT '{}',
        security_modules TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL
    );
`);

// Default scaffold: reflects the moderation commands Sentinel-X is expected
// to ship next, and the security modules already live in bot/security.js.
const DEFAULT_COMMANDS = {
    ban: true,
    kick: true,
    mute: true,
    purge: true,
    warn: true,
};

const DEFAULT_SECURITY_MODULES = {
    antiSpam: true,
    antiLink: true,
};

const selectStmt = db.prepare('SELECT * FROM guild_configs WHERE guild_id = ?');

const upsertStmt = db.prepare(`
    INSERT INTO guild_configs (guild_id, guild_name, commands, security_modules, updated_at)
    VALUES (@guild_id, @guild_name, @commands, @security_modules, @updated_at)
    ON CONFLICT(guild_id) DO UPDATE SET
        guild_name = excluded.guild_name,
        commands = excluded.commands,
        security_modules = excluded.security_modules,
        updated_at = excluded.updated_at
`);

function parseRow(row) {
    if (!row) return null;
    return {
        guildId: row.guild_id,
        guildName: row.guild_name,
        commands: JSON.parse(row.commands),
        securityModules: JSON.parse(row.security_modules),
        updatedAt: row.updated_at,
    };
}

/**
 * Reads a guild's stored configuration, falling back to defaults if the
 * guild has never been configured before. Reading never writes to disk.
 * @param {string} guildId
 * @param {string} [guildName]
 */
function getGuildConfig(guildId, guildName) {
    const row = selectStmt.get(guildId);
    if (row) return parseRow(row);

    return {
        guildId,
        guildName: guildName || null,
        commands: { ...DEFAULT_COMMANDS },
        securityModules: { ...DEFAULT_SECURITY_MODULES },
        updatedAt: null,
    };
}

/**
 * Merges the given patch into a guild's stored configuration and persists it.
 * @param {string} guildId
 * @param {string} guildName
 * @param {{ commands?: Object, securityModules?: Object }} patch
 */
function saveGuildConfig(guildId, guildName, patch = {}) {
    const existing = getGuildConfig(guildId, guildName);

    const merged = {
        guild_id: guildId,
        guild_name: guildName || existing.guildName || null,
        commands: JSON.stringify({ ...existing.commands, ...(patch.commands || {}) }),
        security_modules: JSON.stringify({
            ...existing.securityModules,
            ...(patch.securityModules || {}),
        }),
        updated_at: new Date().toISOString(),
    };

    upsertStmt.run(merged);
    return parseRow(selectStmt.get(guildId));
}

module.exports = {
    getGuildConfig,
    saveGuildConfig,
    DEFAULT_COMMANDS,
    DEFAULT_SECURITY_MODULES,
};
