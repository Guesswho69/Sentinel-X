/**
 * Sentinel-X - Offense Escalation Tracker
 * -------------------------------------
 * Tracks how many times each user has offended (per guild+user key) and
 * resolves that count against a configurable escalation ladder, e.g.:
 *   1st offense -> warn
 *   2nd offense -> 1 minute timeout
 *   3rd offense -> 5 minute timeout
 *   4th+ offense -> 1 hour timeout
 *
 * Used by antiSpam today; written generically so antiMention, antiCaps,
 * and antiEmojiSpam can opt into the same escalation behavior instead of
 * each inventing their own punishment logic.
 */

class EscalationTracker {
    /**
     * @param {Object} [options]
     * @param {number} [options.resetMs=600000] - offense count resets after this
     *   much time has passed since the last offense (a clean slate for
     *   users who stop misbehaving).
     */
    constructor(options = {}) {
        this.resetMs = options.resetMs ?? 600_000;
        /** @type {Map<string, { count: number, lastOffenseAt: number }>} */
        this.offenses = new Map();
    }

    /**
     * Records a new offense for a key and returns the updated offense count.
     * @param {string} key
     * @param {number} [resetMsOverride] - use a different reset window than
     *   the instance default (e.g. a specific guild's configured value)
     * @returns {number}
     */
    recordOffense(key, resetMsOverride) {
        const resetMs = resetMsOverride ?? this.resetMs;
        const now = Date.now();
        const existing = this.offenses.get(key);

        if (existing && now - existing.lastOffenseAt <= resetMs) {
            existing.count += 1;
            existing.lastOffenseAt = now;
            return existing.count;
        }

        this.offenses.set(key, { count: 1, lastOffenseAt: now });
        return 1;
    }

    /**
     * Resolves an offense count against an escalation ladder, returning the
     * highest rung whose offenseCount is <= the current count.
     * @param {number} offenseCount
     * @param {Array<{offenseCount: number, action: string, durationMs: number}>} ladder
     */
    static resolveAction(offenseCount, ladder) {
        let resolved = ladder[0];
        for (const rung of ladder) {
            if (offenseCount >= rung.offenseCount) {
                resolved = rung;
            }
        }
        return resolved;
    }

    /**
     * Clears offense history for a key (e.g. moderator manually pardons a user).
     * @param {string} key
     */
    reset(key) {
        this.offenses.delete(key);
    }

    /**
     * Removes stale entries to bound memory growth. Safe to call on an interval.
     */
    cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.offenses.entries()) {
            if (now - entry.lastOffenseAt > this.resetMs) {
                this.offenses.delete(key);
            }
        }
    }
}

module.exports = { EscalationTracker };

