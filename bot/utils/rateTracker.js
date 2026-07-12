/**
 * Sentinel-X - Rate Tracker
 * -------------------------------------
 * A generic sliding-window event counter, keyed by any string (user ID,
 * guild ID, executor ID, etc). This is the one piece of "count events
 * within a time window" logic in the whole codebase - antiSpam, antiMention,
 * antiEmojiSpam, antiRaid, antiNuke, and antiWebhook all use an instance of
 * this instead of re-implementing timestamp arrays themselves.
 */

class RateTracker {
    /**
     * @param {Object} [options]
     * @param {number} [options.timeWindowMs=10000] - how far back events count
     */
    constructor(options = {}) {
        this.timeWindowMs = options.timeWindowMs ?? 10_000;
        /** @type {Map<string, number[]>} key -> timestamps */
        this.events = new Map();
    }

    /**
     * Records one event for a key and returns how many events that key has
     * within the active window (including the one just recorded).
     * @param {string} key
     * @param {number} [windowMsOverride] - use a different window than the
     *   instance default for this call (e.g. a specific guild's configured
     *   threshold, when one RateTracker instance is shared across guilds)
     * @returns {number}
     */
    record(key, windowMsOverride) {
        const window = windowMsOverride ?? this.timeWindowMs;
        const now = Date.now();
        const timestamps = this.events.get(key) || [];
        const recent = timestamps.filter((t) => now - t <= window);
        recent.push(now);
        this.events.set(key, recent);
        return recent.length;
    }

    /**
     * Returns the current count for a key without recording a new event.
     * @param {string} key
     * @param {number} [windowMsOverride]
     */
    count(key, windowMsOverride) {
        const window = windowMsOverride ?? this.timeWindowMs;
        const now = Date.now();
        const timestamps = this.events.get(key) || [];
        return timestamps.filter((t) => now - t <= window).length;
    }

    /**
     * Clears tracking for a single key (e.g. after punishment is applied).
     * @param {string} key
     */
    reset(key) {
        this.events.delete(key);
    }

    /**
     * Removes stale entries across all keys. Safe to call on an interval
     * to bound memory growth on a busy bot.
     */
    cleanup() {
        const now = Date.now();
        for (const [key, timestamps] of this.events.entries()) {
            const recent = timestamps.filter((t) => now - t <= this.timeWindowMs);
            if (recent.length === 0) {
                this.events.delete(key);
            } else {
                this.events.set(key, recent);
            }
        }
    }
}

module.exports = { RateTracker };
