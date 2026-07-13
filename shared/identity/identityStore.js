/**
 * Sentinel-X - Identity Store (SHARED)
 * -------------------------------------
 * Persists identity data: the Discord account record, linked third-party
 * accounts (Roblox today, more providers later), active sessions, login
 * history, and in-progress verification challenges.
 *
 * Keyed by Discord user ID (NOT guild ID) - identity is global to a person,
 * not scoped to one server, unlike shared/guildConfigStore.js. Both the
 * dashboard and the bot read/write this same file, exactly like the guild
 * config store: this file is the single source of truth for identity data,
 * never duplicated elsewhere.
 *
 * Persists ONLY identity data described above. Never stores Discord
 * passwords or permanent OAuth access tokens - those still live solely in
 * the dashboard's session (see dashboard/routes/auth.js).
 */

const path = require('path');
const { JsonStore } = require('../jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'identities.json'));

const MAX_LOGIN_HISTORY = 20;
const MAX_MODERATION_HISTORY = 50;

/**
 * Appends an item to an array, keeping only the most recent `maxLen`
 * entries. Used for login history, sessions, and moderation history so
 * none of them grow unbounded for a long-lived account.
 */
function pushCapped(array, item, maxLen) {
    const next = [...(array || []), item];
    if (next.length > maxLen) {
        return next.slice(next.length - maxLen);
    }
    return next;
}

function buildDefaultProfile(discordId) {
    return {
        discordId,
        discord: {
            username: null,
            globalName: null,
            avatar: null,
            createdAt: null, // Discord account creation date (from snowflake), set on first login
            firstLoginAt: null,
            lastLoginAt: null,
        },
        loginHistory: [], // [{ timestamp, ip, userAgent }]
        sessions: [],     // [{ sessionId, createdAt, lastSeenAt, ip, userAgent }]
        linkedAccounts: {
            roblox: null, // { id, username, displayName, avatarUrl, accountCreatedAt, groups, verifiedAt }
        },
        pendingVerification: null, // { provider, token, expiresAt }
        moderationHistory: [], // [{ guildId, type, timestamp }] - summary references, not full mod-log detail
        updatedAt: null,
    };
}

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
 * Reads a user's identity profile, creating schema defaults if none exists
 * yet. Never writes to disk on its own - read-only.
 * @param {string} discordId
 */
function getProfile(discordId) {
    const defaults = buildDefaultProfile(discordId);
    const stored = store.get(discordId);
    if (!stored) return defaults;
    return deepMerge(defaults, stored);
}

/**
 * Persists a full patch onto a user's profile.
 * @param {string} discordId
 * @param {Object} patch
 */
function saveProfile(discordId, patch = {}) {
    const current = getProfile(discordId);
    const merged = deepMerge(current, patch);
    merged.discordId = discordId;
    merged.updatedAt = new Date().toISOString();
    store.set(discordId, merged);
    return merged;
}

/**
 * Upserts Discord account details and records a login. Called once from
 * the OAuth callback (dashboard/routes/auth.js) on every successful login -
 * that route doesn't need to know anything about identity schema, it just
 * calls this one function.
 * @param {string} discordId
 * @param {{ username: string, globalName: string|null, avatar: string|null, createdAt: string }} discordData
 * @param {{ ip?: string, userAgent?: string }} [loginMeta]
 */
function recordLogin(discordId, discordData, loginMeta = {}) {
    const current = getProfile(discordId);
    const now = new Date().toISOString();

    const discord = {
        ...current.discord,
        ...discordData,
        firstLoginAt: current.discord.firstLoginAt || now,
        lastLoginAt: now,
    };

    const loginHistory = pushCapped(
        current.loginHistory,
        { timestamp: now, ip: loginMeta.ip || null, userAgent: loginMeta.userAgent || null },
        MAX_LOGIN_HISTORY
    );

    return saveProfile(discordId, { discord, loginHistory });
}

/**
 * Adds an active session record (e.g. one per dashboard login), so the
 * Security page can list "recent devices" and allow revoking individual
 * sessions.
 * @param {string} discordId
 * @param {{ sessionId: string, ip?: string, userAgent?: string }} session
 */
function addSession(discordId, session) {
    const current = getProfile(discordId);
    const now = new Date().toISOString();

    const sessions = pushCapped(
        current.sessions.filter((s) => s.sessionId !== session.sessionId),
        { sessionId: session.sessionId, createdAt: now, lastSeenAt: now, ip: session.ip || null, userAgent: session.userAgent || null },
        50
    );

    return saveProfile(discordId, { sessions });
}

/**
 * Removes a single session (used by the "revoke" button on the Security page).
 * @param {string} discordId
 * @param {string} sessionId
 */
function removeSession(discordId, sessionId) {
    const current = getProfile(discordId);
    const sessions = current.sessions.filter((s) => s.sessionId !== sessionId);
    return saveProfile(discordId, { sessions });
}

/**
 * Links a verified third-party provider account to this identity.
 * @param {string} discordId
 * @param {string} providerName - e.g. "roblox"
 * @param {Object} providerData - provider-specific shape, includes verifiedAt
 */
function linkProvider(discordId, providerName, providerData) {
    const current = getProfile(discordId);
    const linkedAccounts = { ...current.linkedAccounts, [providerName]: providerData };
    return saveProfile(discordId, { linkedAccounts, pendingVerification: null });
}

/**
 * Removes a linked provider account.
 * @param {string} discordId
 * @param {string} providerName
 */
function unlinkProvider(discordId, providerName) {
    const current = getProfile(discordId);
    const linkedAccounts = { ...current.linkedAccounts, [providerName]: null };
    return saveProfile(discordId, { linkedAccounts });
}

/**
 * Records an in-progress verification challenge (e.g. "put this code in
 * your Roblox bio"), so the confirm step can look it up and validate it.
 * @param {string} discordId
 * @param {string} providerName
 * @param {string} token
 * @param {number} expiresAtMs - epoch ms
 */
function setPendingVerification(discordId, providerName, token, expiresAtMs) {
    return saveProfile(discordId, {
        pendingVerification: { provider: providerName, token, expiresAt: expiresAtMs },
    });
}

/**
 * @param {string} discordId
 * @returns {{provider: string, token: string, expiresAt: number}|null}
 */
function getPendingVerification(discordId) {
    const current = getProfile(discordId);
    if (!current.pendingVerification) return null;
    if (Date.now() > current.pendingVerification.expiresAt) return null; // expired
    return current.pendingVerification;
}

/**
 * Appends a moderation-history reference (used as a trust-score input).
 * This intentionally stores only a lightweight summary, not full details -
 * the authoritative moderation log lives in bot/logging/moderationLogs.js
 * once that module exists; this is never a second copy of that data.
 * @param {string} discordId
 * @param {{ guildId: string, type: string }} event
 */
function recordModerationEvent(discordId, event) {
    const current = getProfile(discordId);
    const moderationHistory = pushCapped(
        current.moderationHistory,
        { guildId: event.guildId, type: event.type, timestamp: new Date().toISOString() },
        MAX_MODERATION_HISTORY
    );
    return saveProfile(discordId, { moderationHistory });
}

module.exports = {
    getProfile,
    saveProfile,
    recordLogin,
    addSession,
    removeSession,
    linkProvider,
    unlinkProvider,
    setPendingVerification,
    getPendingVerification,
    recordModerationEvent,
};

