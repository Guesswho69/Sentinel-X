/**
 * Sentinel-X - Default Configuration
 * -------------------------------------
 * Every threshold, cooldown, and toggle used anywhere in the security
 * engine lives here. No module should ever hardcode a number - it should
 * read it from a guild's resolved config (see config/guildConfig.js),
 * which merges these defaults with per-guild overrides.
 *
 * Keeping this centralized means:
 *   - The dashboard (or future slash commands) has one place to read/write
 *   - Every module's behavior is documented in one file
 *   - Adding a new module means adding one new key here, not hunting
 *     through detection code for magic numbers
 */

const SEVERITY = Object.freeze({
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL',
});

// Relative ordering, used by threatManager to compare/escalate severities.
const SEVERITY_WEIGHT = Object.freeze({
    [SEVERITY.LOW]: 1,
    [SEVERITY.MEDIUM]: 2,
    [SEVERITY.HIGH]: 3,
    [SEVERITY.CRITICAL]: 4,
});

const DEFAULT_CONFIG = Object.freeze({
    antiSpam: {
        enabled: true,
        maxMessages: 5,          // messages allowed...
        timeWindowMs: 5000,      // ...within this window
        escalation: [
            // Automatic punishment ladder. "action" hooks are resolved by
            // whatever calls AntiSpam - this module only recommends them.
            { offenseCount: 1, action: 'warn', durationMs: 0 },
            { offenseCount: 2, action: 'timeout', durationMs: 60_000 },        // 1 min
            { offenseCount: 3, action: 'timeout', durationMs: 300_000 },       // 5 min
            { offenseCount: 4, action: 'timeout', durationMs: 3_600_000 },     // 1 hour
        ],
        offenseResetMs: 600_000, // offense count forgotten after 10 quiet minutes
    },

    antiLink: {
        enabled: true,
        whitelist: [],           // domains always allowed, e.g. ["youtube.com"]
        blockDiscordInvites: true, // delegate invite handling to antiInvite
        maliciousDomainBlocklist: [], // populated from a threat-intel source later
    },

    antiInvite: {
        enabled: true,
        allowOwnServerInvites: true,
        whitelistedInviteCodes: [], // specific invite codes always allowed
    },

    antiMention: {
        enabled: true,
        maxMentionsPerMessage: 5,
        blockEveryoneMention: true,
        blockHereMention: true,
    },

    antiCaps: {
        enabled: true,
        minLength: 10,           // ignore short messages (false-positive prone)
        maxUppercasePercent: 70, // percentage of letters that may be uppercase
    },

    antiEmojiSpam: {
        enabled: true,
        maxEmojis: 8,
    },

    antiRaid: {
        enabled: true,
        joinThreshold: 10,       // joins...
        timeWindowMs: 30_000,    // ...within this window triggers lockdown
        lockdownDurationMs: 600_000, // 10 minutes
        newAccountThresholdMs: 604_800_000, // 7 days - "new" account during a raid
    },

    antiNuke: {
        enabled: true,
        maxChannelDeletes: 3,
        maxChannelCreates: 5,
        maxRoleDeletes: 3,
        maxRoleCreates: 5,
        timeWindowMs: 60_000,
        // Punishment hooks are opt-in and OFF by default - a false positive
        // here is far more damaging than in message-level moderation.
        autoPunishExecutor: false,
    },

    antiWebhook: {
        enabled: true,
        maxWebhookCreates: 3,
        timeWindowMs: 60_000,
    },

    suspiciousAccount: {
        enabled: true,
        minAccountAgeMs: 259_200_000, // 3 days
        flagDuringRaidOnly: false,     // if true, only flags when antiRaid is active
    },

    threatManager: {
        duplicateSuppressionMs: 15_000, // identical alerts within this window are merged
    },

    logging: {
        // Channel *names* Sentinel-X will look for in a guild by default.
        // A real deployment would map these to channel IDs per guild instead;
        // structure is here so that wiring is a config change, not a code change.
        channels: {
            messageLogs: 'message-logs',
            memberLogs: 'member-logs',
            moderationLogs: 'mod-logs',
            serverLogs: 'server-logs',
            securityLogs: 'security-logs',
            auditLogs: 'audit-logs',
        },
    },
});

module.exports = {
    SEVERITY,
    SEVERITY_WEIGHT,
    DEFAULT_CONFIG,
};

