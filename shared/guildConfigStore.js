/**
 * Sentinel-X - Guild Configuration Store (SHARED)
 * -------------------------------------
 * This is what actually makes "the dashboard" and "the bot" one product
 * instead of two disconnected processes: both sides read and write this
 * exact file. When an admin flips Anti-Raid off on the dashboard, the
 * bot's very next check reads that same change from disk.
 *
 * Schema is split into four sections, matching the dashboard pages:
 *   - security:   { [moduleName]: { enabled, actions: { [actionName]: boolean } } }
 *   - moderation: { trustedRoles, thresholds, punishments } - tuning
 *   - logging:    { enabledCategories, channels }          - per-category on/off + channel ID
 *   - commands:   { categories, individual, settings }      - command toggles
 *
 * Persists ONLY configuration. Never Discord credentials, passwords, or
 * access tokens - those live solely in the dashboard's session (see
 * dashboard/routes/auth.js) and are never written here.
 */

const path = require('path');
const { JsonStore } = require('./jsonStore');
const { DEFAULT_CONFIG } = require('../bot/config/defaults');

const store = new JsonStore(path.join(__dirname, 'data', 'guild-configs.json'));

// Canonical list of security modules. Kept as an explicit array (rather
// than inferred from DEFAULT_CONFIG's keys) so the dashboard's toggle UI
// and any future module additions have one place that defines "what
// modules exist", independent of internal config shape.
const SECURITY_MODULES = [
    'antiSpam',
    'antiLink',
    'antiInvite',
    'antiMention',
    'antiCaps',
    'antiEmojiSpam',
    'antiRaid',
    'antiNuke',
    'antiWebhook',
];

const LOG_CATEGORIES = [
    'messageLogs',
    'memberLogs',
    'moderationLogs',
    'serverLogs',
    'securityLogs',
    'auditLogs',
];

// Which automated actions each security module can take, and their
// shipped default (on/off). Destructive/high-impact actions (banning,
// executing anti-nuke punishments) default OFF - everything else defaults
// to match the module's existing behavior today. This is the one place
// that defines "what actions exist per module" - the dashboard's toggle
// UI and the bot's action-gating both read from here, so adding a new
// action to a module means editing one entry, not hunting through code.
const SECURITY_ACTIONS = {
    antiSpam:      { delete: true, warn: true, timeout: true },
    antiLink:      { delete: true, warn: true },
    antiInvite:    { delete: true, warn: true },
    antiMention:   { delete: true, warn: true, timeout: true },
    antiCaps:      { delete: true, warn: true },
    antiEmojiSpam: { delete: true, warn: true },
    antiRaid:      { lockdown: true, kickNewAccounts: false },
    antiNuke:      { stripRoles: false, timeoutExecutor: false, banExecutor: false },
    antiWebhook:   { deleteWebhook: true, timeoutCreator: false },
};

const DEFAULT_COMMAND_CATEGORIES = {
    moderation: true,
    utility: true,
    security: true,
};

const DEFAULT_INDIVIDUAL_COMMANDS = {
    ban: true,
    kick: true,
    mute: true,
    purge: true,
    warn: true,
};

// Trust score weights are intentionally fully configurable per guild - this
// is only the shipped default, read by shared/identity/trustScoreEngine.js.
// That engine never hardcodes a number itself; every weight below is a
// value it's told to use, not a constant baked into scoring logic.
const DEFAULT_IDENTITY_WEIGHTS = {
    minScore: 0,
    maxScore: 100,
    baseScore: 50,
    discordAccountAge: { pointsPerDay: 0.05, maxPoints: 15 },
    robloxAccountAge: { pointsPerDay: 0.05, maxPoints: 15 },
    verifiedProviders: { pointsPerProvider: 8, maxPoints: 16 },
    serverTenure: { pointsPerDay: 0.1, maxPoints: 20 },
    moderationHistory: { pointsPerIncident: -5, maxPenalty: -30 },
};

function defaultSecurityToggles() {
    return SECURITY_MODULES.reduce((acc, key) => {
        acc[key] = {
            enabled: DEFAULT_CONFIG[key]?.enabled ?? true,
            actions: { ...(SECURITY_ACTIONS[key] || {}) },
        };
        return acc;
    }, {});
}

/**
 * Migrates a stored security section from the old flat-boolean shape
 * ({ antiSpam: true }) to the current { antiSpam: { enabled, actions } }
 * shape, so guilds configured before this change don't get their settings
 * silently discarded or corrupted by a naive merge. New saves always
 * write the current shape - this only runs on read, against old data.
 * @param {Object} storedSecurity
 */
function migrateSecuritySection(storedSecurity) {
    if (!storedSecurity || typeof storedSecurity !== 'object') return storedSecurity;

    const migrated = {};
    for (const [moduleName, value] of Object.entries(storedSecurity)) {
        if (typeof value === 'boolean') {
            // Old shape: just carry the enabled flag forward, actions stay default.
            migrated[moduleName] = { enabled: value };
        } else {
            migrated[moduleName] = value;
        }
    }
    return migrated;
}

function defaultLogCategories() {
    return LOG_CATEGORIES.reduce((acc, key) => {
        acc[key] = true;
        return acc;
    }, {});
}

function defaultLogChannels() {
    return LOG_CATEGORIES.reduce((acc, key) => {
        acc[key] = null; // no channel configured yet
        return acc;
    }, {});
}

function buildDefaultGuildConfig(guildId, guildName) {
    return {
        guildId,
        guildName: guildName || null,
        security: defaultSecurityToggles(),
        moderation: {
            trustedRoles: [],  // role IDs exempt from automated punishment
            thresholds: {},    // per-module threshold overrides, e.g. { antiSpam: { maxMessages: 8 } }
            punishments: {},   // per-module punishment overrides, e.g. { antiSpam: { escalation: [...] } }
        },
        logging: {
            enabledCategories: defaultLogCategories(),
            channels: defaultLogChannels(),
        },
        commands: {
            categories: { ...DEFAULT_COMMAND_CATEGORIES },
            individual: { ...DEFAULT_INDIVIDUAL_COMMANDS },
            settings: {}, // arbitrary per-command config, e.g. { purge: { maxAmount: 100 } }
        },
        identity: {
            requiredProviders: [], // e.g. ['roblox'] to require Roblox verification for access
            trustScoreWeights: { ...DEFAULT_IDENTITY_WEIGHTS },
            roleSyncRules: [], // future: [{ provider: 'roblox', groupId, rank, roleId }]
        },
        updatedAt: null,
    };
}

/**
 * Deep-merges override onto base without mutating either. Arrays are
 * replaced wholesale (whitelists/role-ID lists shouldn't be "merged").
 */
function deepMerge(base, override) {
    if (!override || typeof override !== 'object') return base;
    const result = { ...base };

    for (const key of Object.keys(override)) {
        const baseValue = base?.[key];
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
 * Reads a guild's full configuration, merging any stored data onto schema
 * defaults - so a field added to the schema after a guild was first
 * configured still has a sensible value instead of being undefined.
 * @param {string} guildId
 * @param {string} [guildName]
 */
function getGuildConfig(guildId, guildName) {
    const defaults = buildDefaultGuildConfig(guildId, guildName);
    const stored = store.get(guildId);
    if (!stored) return defaults;

    const migratedStored = {
        ...stored,
        security: migrateSecuritySection(stored.security),
    };

    return deepMerge(defaults, migratedStored);
}

/**
 * Merges a partial patch into a guild's configuration and persists it.
 * @param {string} guildId
 * @param {string} guildName
 * @param {{ security?: Object, moderation?: Object, logging?: Object, commands?: Object }} patch
 */
function saveGuildConfig(guildId, guildName, patch = {}) {
    const current = getGuildConfig(guildId, guildName);
    const normalizedPatch = patch.security
        ? { ...patch, security: migrateSecuritySection(patch.security) }
        : patch;
    const merged = deepMerge(current, normalizedPatch);
    merged.guildId = guildId;
    merged.guildName = guildName || current.guildName || null;
    merged.updatedAt = new Date().toISOString();
    store.set(guildId, merged);
    return merged;
}

module.exports = {
    getGuildConfig,
    saveGuildConfig,
    SECURITY_MODULES,
    SECURITY_ACTIONS,
    LOG_CATEGORIES,
    DEFAULT_IDENTITY_WEIGHTS,
};
