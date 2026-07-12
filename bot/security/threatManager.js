/**
 * Sentinel-X - Threat Manager
 * -------------------------------------
 * The single funnel every security module reports through. Responsibilities:
 *   1. Assign/validate a severity level for each alert
 *   2. Suppress duplicate alerts (same guild+user+type firing repeatedly
 *      within a short window - e.g. antiSpam re-triggering every message
 *      while a user is mid-flood shouldn't spam the security log 10 times)
 *   3. Forward the structured event to the security log channel
 *   4. Expose the event to anything else that wants to react to threats
 *      (future: auto-punishment engine, dashboard live feed, webhooks)
 *
 * Every detection module (antiSpam, antiLink, antiRaid, antiNuke, etc.)
 * calls reportThreat() instead of building its own embed or deciding for
 * itself whether an alert is "new" - that logic lives here exactly once.
 */

const { EventEmitter } = require('events');
const { SEVERITY, SEVERITY_WEIGHT } = require('../config/defaults');
const logger = require('../logger');

class ThreatManager extends EventEmitter {
    /**
     * @param {Object} [options]
     * @param {number} [options.duplicateSuppressionMs=15000]
     */
    constructor(options = {}) {
        super();
        this.duplicateSuppressionMs = options.duplicateSuppressionMs ?? 15_000;
        /** @type {Map<string, number>} dedupeKey -> last-seen timestamp */
        this.recentAlerts = new Map();
    }

    /**
     * Builds the key used to detect duplicate alerts: same guild, same
     * subject (user or executor), same module+type counts as "the same threat"
     * within the suppression window.
     */
    _dedupeKey({ guildId, subjectId, module, type }) {
        return `${guildId}:${subjectId}:${module}:${type}`;
    }

    _isDuplicate(key) {
        const lastSeen = this.recentAlerts.get(key);
        if (!lastSeen) return false;
        return Date.now() - lastSeen <= this.duplicateSuppressionMs;
    }

    /**
     * Reports a threat detected by any security module.
     *
     * @param {Object} threat
     * @param {import('discord.js').Guild} threat.guild
     * @param {import('discord.js').User} [threat.user] - the offending user, if any
     * @param {string} threat.module - e.g. "antiSpam", "antiNuke"
     * @param {string} threat.type - e.g. "MESSAGE_FLOOD", "MASS_CHANNEL_DELETE"
     * @param {keyof SEVERITY} [threat.severity=SEVERITY.MEDIUM]
     * @param {string} threat.reason - human-readable explanation
     * @param {Object} [threat.metadata] - arbitrary extra detail for the embed/log
     * @param {Object} threat.resolvedConfig - the guild's resolved config
     * @returns {Promise<{ suppressed: boolean }>}
     */
    async reportThreat(threat) {
        const {
            guild,
            user,
            module: moduleName,
            type,
            severity = SEVERITY.MEDIUM,
            reason,
            metadata = {},
            resolvedConfig,
        } = threat;

        if (!SEVERITY_WEIGHT[severity]) {
            console.warn(`[ThreatManager] Unknown severity "${severity}" from ${moduleName}, defaulting to MEDIUM`);
        }
        const normalizedSeverity = SEVERITY_WEIGHT[severity] ? severity : SEVERITY.MEDIUM;

        const subjectId = user?.id || 'guild';
        const dedupeKey = this._dedupeKey({ guildId: guild?.id, subjectId, module: moduleName, type });

        if (this._isDuplicate(dedupeKey)) {
            return { suppressed: true };
        }
        this.recentAlerts.set(dedupeKey, Date.now());

        // Always goes to the structured console logger (bot/logger.js),
        // regardless of whether a Discord log channel is configured.
        logger.logSecurityEvent({
            guild,
            user,
            type: `${moduleName}:${type}`,
            reason,
        });

        // Best-effort: post a formatted embed to the guild's security-logs
        // channel, if one is configured and reachable. Handled by
        // logging/securityLogs.js, which subscribes to the 'threat' event
        // below - this module stays focused on detection bookkeeping only.

        // Let anything else in the process (future auto-punishment engine,
        // a live dashboard feed, etc.) react to this event.
        this.emit('threat', {
            guild,
            user,
            module: moduleName,
            type,
            severity: normalizedSeverity,
            reason,
            metadata,
            resolvedConfig,
            timestamp: Date.now(),
        });

        return { suppressed: false };
    }

    /**
     * Removes stale dedupe entries to bound memory growth. Safe to call on
     * an interval.
     */
    cleanup() {
        const now = Date.now();
        for (const [key, lastSeen] of this.recentAlerts.entries()) {
            if (now - lastSeen > this.duplicateSuppressionMs) {
                this.recentAlerts.delete(key);
            }
        }
    }
}

// Sentinel-X runs one bot process per deployment today, so a singleton is
// the right shape: every module imports the same instance rather than
// wiring one up themselves.
const threatManager = new ThreatManager();

module.exports = threatManager;
module.exports.ThreatManager = ThreatManager;

