/**
 * Sentinel-X - Guild Configuration Manager
 * -------------------------------------
 * Resolves the *effective* configuration for a guild: defaults from
 * config/defaults.js, deep-merged with any per-guild overrides.
 *
 * This is intentionally an in-memory store, not a database. Guild-level
 * feature configuration (which the dashboard already persists to its own
 * JSON store) can be loaded into this manager via setGuildOverrides() -
 * that integration point is deliberately left for when the bot and
 * dashboard are wired together, so this module has no dependency on the
 * dashboard's storage format today.
 */

const { DEFAULT_CONFIG } = require('./defaults');

/** @type {Map<string, Object>} guildId -> partial config override */
const overridesByGuild = new Map();

/**
 * Deep-merges a partial override object into a base object, without
 * mutating either input. Arrays are replaced wholesale (not merged) since
 * partial array merges are rarely what you want for things like whitelists.
 */
function deepMerge(base, override) {
    if (!override || typeof override !== 'object') return base;

    const result = { ...base };

    for (const key of Object.keys(override)) {
        const baseValue = base ? base[key] : undefined;
        const overrideValue = override[key];

        if (
            baseValue &&
            typeof baseValue === 'object' &&
            !Array.isArray(baseValue) &&
            overrideValue &&
            typeof overrideValue === 'object' &&
            !Array.isArray(overrideValue)
        ) {
            result[key] = deepMerge(baseValue, overrideValue);
        } else {
            result[key] = overrideValue;
        }
    }

    return result;
}

/**
 * Returns the fully-resolved configuration for a guild.
 * Always returns a fresh object - safe for callers to read but not
 * intended to be mutated in place (use setGuildOverrides to persist changes).
 * @param {string} guildId
 */
function getGuildConfig(guildId) {
    const overrides = overridesByGuild.get(guildId);
    return deepMerge(DEFAULT_CONFIG, overrides);
}

/**
 * Replaces a guild's override object entirely.
 * @param {string} guildId
 * @param {Object} overrides
 */
function setGuildOverrides(guildId, overrides) {
    overridesByGuild.set(guildId, overrides || {});
}

/**
 * Merges a partial patch into a guild's existing overrides (e.g. toggling
 * a single module on/off without touching the rest of the config).
 * @param {string} guildId
 * @param {Object} patch
 */
function patchGuildOverrides(guildId, patch) {
    const existing = overridesByGuild.get(guildId) || {};
    overridesByGuild.set(guildId, deepMerge(existing, patch));
}

/**
 * Clears all overrides for a guild, reverting it to system defaults.
 * @param {string} guildId
 */
function resetGuildConfig(guildId) {
    overridesByGuild.delete(guildId);
}

module.exports = {
    getGuildConfig,
    setGuildOverrides,
    patchGuildOverrides,
    resetGuildConfig,
};
