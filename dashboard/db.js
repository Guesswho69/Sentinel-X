/**
 * Sentinel-X Dashboard - Guild configuration store
 * -------------------------------------
 * The ONLY thing persisted here is per-guild configuration: which commands
 * and security modules are enabled. No Discord credentials, passwords, or
 * access tokens are ever written to this store.
 *
 * Implemented as a plain JSON file on disk (no native/compiled dependency),
 * so it installs and builds reliably on platforms like Render without a
 * working node-gyp/C++ toolchain. Every exported function keeps the same
 * shape as before, so routes never needed to change when this swapped out
 * from better-sqlite3 - and can swap again later (Postgres, Redis, etc.)
 * without touching route code.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'guild-configs.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

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

/**
 * Loads the entire config store from disk into memory.
 * Returns {} if the file doesn't exist yet or is unreadable/corrupt -
 * a bad file should never crash the dashboard, just start it fresh.
 */
function loadStore() {
    try {
        if (!fs.existsSync(DB_FILE)) return {};
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        return raw.trim() ? JSON.parse(raw) : {};
    } catch (error) {
        console.error('[Sentinel-X Dashboard] Failed to read guild config store, starting fresh:', error);
        return {};
    }
}

/**
 * Writes the entire config store to disk atomically (write to a temp file,
 * then rename) so a crash mid-write can't corrupt the real file.
 */
function saveStore(store) {
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);
}

/**
 * Reads a guild's stored configuration, falling back to defaults if the
 * guild has never been configured before. Reading never writes to disk.
 * @param {string} guildId
 * @param {string} [guildName]
 */
function getGuildConfig(guildId, guildName) {
    const store = loadStore();
    const existing = store[guildId];

    if (existing) {
        return {
            guildId,
            guildName: existing.guildName || guildName || null,
            commands: { ...DEFAULT_COMMANDS, ...existing.commands },
            securityModules: { ...DEFAULT_SECURITY_MODULES, ...existing.securityModules },
            updatedAt: existing.updatedAt || null,
        };
    }

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
    const store = loadStore();
    const existing = getGuildConfig(guildId, guildName);

    const updated = {
        guildName: guildName || existing.guildName || null,
        commands: { ...existing.commands, ...(patch.commands || {}) },
        securityModules: { ...existing.securityModules, ...(patch.securityModules || {}) },
        updatedAt: new Date().toISOString(),
    };

    store[guildId] = updated;
    saveStore(store);

    return { guildId, ...updated };
}

module.exports = {
    getGuildConfig,
    saveGuildConfig,
    DEFAULT_COMMANDS,
    DEFAULT_SECURITY_MODULES,
};
