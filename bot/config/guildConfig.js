/**
 * Sentinel-X - Guild Configuration Manager (bot-side)
 * -------------------------------------
 * Resolves the *effective* configuration for a guild by taking the bot's
 * rich, per-module defaults (config/defaults.js - full thresholds,
 * escalation ladders, etc.) and layering the dashboard's simpler,
 * persisted overrides on top (shared/guildConfigStore.js - on/off toggles,
 * threshold tweaks, trusted roles, log channels, command toggles).
 *
 * This is the integration point: every security module already calls
 * getGuildConfig(guildId) and reads config.<moduleName>.enabled /
 * .maxMessages / etc. Nothing in those modules needed to change - this
 * file is the only place that knows the dashboard's storage exists.
 *
 * A short in-memory cache avoids re-reading the shared config file on
 * every single message in busy servers, while staying responsive enough
 * that a dashboard change takes effect within a few seconds.
 */

const { DEFAULT_CONFIG } = require('./defaults');
const sharedConfigStore = require('../../shared/guildConfigStore');

const CACHE_TTL_MS = 5_000;
/** @type {Map<string, { config: Object, cachedAt: number }>} */
const cache = new Map();

/**
 * Deep-merges override onto base without mutating either. Arrays are
 * replaced wholesale (whitelists/escalation ladders shouldn't be "merged").
 */
function deepMerge(base, override) {
    if (!override || typeof override !== 'object') return base;
    const result = { ...base };

    for (const key of Object.keys(override)) {
        const baseValue = base ? base[key] : undefined;
        const overrideValue = override[key];

        if (
            baseValue && typeof baseValue === 'object' && !Array.isArray(baseValue) &&
            overrideValue && typeof overrideValue === 'object' && !Array.isArray(overrideValue)
        ) {
            result[key] = deepMerge(baseValue, overrideValue);
        } else {
            result[key] = overrideValue;
        }
    }

    return result;
}

/**
 * Builds the bot's rich resolved config for a guild by layering the
 * dashboard's persisted config onto config/defaults.js's DEFAULT_CONFIG.
 * @param {string} guildId
 * @param {string} [guildName]
 */
function resolveGuildConfig(guildId, guildName) {
    const dashboardConfig = sharedConfigStore.getGuildConfig(guildId, guildName);
    let resolved = { ...DEFAULT_CONFIG };

    // 1. Security module on/off toggles
    for (const moduleName of sharedConfigStore.SECURITY_MODULES) {
        if (resolved[moduleName]) {
            resolved[moduleName] = {
                ...resolved[moduleName],
                enabled: dashboardConfig.security?.[moduleName] ?? resolved[moduleName].enabled,
            };
        }
    }

    // 2. Per-module threshold overrides (e.g. { antiSpam: { maxMessages: 8 } })
    for (const [moduleName, overrides] of Object.entries(dashboardConfig.moderation?.thresholds || {})) {
        if (resolved[moduleName]) {
            resolved[moduleName] = deepMerge(resolved[moduleName], overrides);
        }
    }

    // 3. Per-module punishment overrides (e.g. a custom escalation ladder)
    for (const [moduleName, overrides] of Object.entries(dashboardConfig.moderation?.punishments || {})) {
        if (resolved[moduleName]) {
            resolved[moduleName] = deepMerge(resolved[moduleName], overrides);
        }
    }

    // 4. Trusted roles - exposed at top level for utils/permissions.js to consult
    resolved.trustedRoleIds = dashboardConfig.moderation?.trustedRoles || [];

    // 5. Logging - category on/off + explicit channel IDs (set via dashboard)
    resolved.logging = {
        enabledCategories: dashboardConfig.logging?.enabledCategories || {},
        channels: dashboardConfig.logging?.channels || {},
    };

    // 6. Command toggles - for future command-permission checks
    resolved.commands = dashboardConfig.commands || {};

    return resolved;
}

/**
 * Returns the fully-resolved configuration for a guild, cached briefly to
 * avoid a disk read on every message in high-traffic servers.
 * @param {string} guildId
 * @param {string} [guildName] - passed through so first-time config creation
 *   can record a human-readable guild name
 */
function getGuildConfig(guildId, guildName) {
    const now = Date.now();
    const cached = cache.get(guildId);

    if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
        return cached.config;
    }

    const resolved = resolveGuildConfig(guildId, guildName);
    cache.set(guildId, { config: resolved, cachedAt: now });
    return resolved;
}

/**
 * Forces the next getGuildConfig() call for a guild to bypass the cache
 * and re-read from disk. Useful right after the dashboard saves a change,
 * if the bot process ever needs to reflect it immediately rather than
 * waiting out the cache TTL.
 * @param {string} guildId
 */
function invalidateCache(guildId) {
    cache.delete(guildId);
}

module.exports = {
    getGuildConfig,
    invalidateCache,
};
