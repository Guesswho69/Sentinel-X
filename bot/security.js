/**
 * Sentinel-X Security Engine
 * -------------------------------------
 * Contains the detection modules used by the bot:
 *   - AntiSpam: message-flood detection per user
 *   - AntiLink: suspicious URL detection
 *
 * Both modules are intentionally self-contained and stateless from the
 * caller's perspective (index.js just calls check functions and reacts
 * to the results). This keeps detection logic fully separated from
 * Discord-specific bot behavior.
 */

// ---------------------------------------------------------------------------
// Anti-Spam
// ---------------------------------------------------------------------------

/**
 * Tracks recent message timestamps per user and flags flooding behavior.
 */
class AntiSpam {
    /**
     * @param {Object} [options]
     * @param {number} [options.maxMessages=5] - Max messages allowed within the time window
     * @param {number} [options.timeWindowMs=5000] - Time window in milliseconds
     */
    constructor(options = {}) {
        this.maxMessages = options.maxMessages ?? 5;
        this.timeWindowMs = options.timeWindowMs ?? 5000;

        // Map<userId, number[]> - timestamps of recent messages per user
        this.userActivity = new Map();
    }

    /**
     * Records a message event for a user and checks whether it constitutes spam.
     *
     * @param {string} userId
     * @returns {{ isSpam: boolean, messageCount: number, reason: string|null }}
     */
    checkMessage(userId) {
        const now = Date.now();
        const timestamps = this.userActivity.get(userId) || [];

        // Keep only timestamps within the active time window
        const recent = timestamps.filter((t) => now - t <= this.timeWindowMs);
        recent.push(now);
        this.userActivity.set(userId, recent);

        const isSpam = recent.length > this.maxMessages;

        return {
            isSpam,
            messageCount: recent.length,
            reason: isSpam
                ? `Sent ${recent.length} messages within ${this.timeWindowMs}ms (limit: ${this.maxMessages})`
                : null,
        };
    }

    /**
     * Clears tracked activity for a user (e.g. after a warning/timeout is issued).
     * @param {string} userId
     */
    resetUser(userId) {
        this.userActivity.delete(userId);
    }

    /**
     * Removes stale entries to prevent unbounded memory growth.
     * Safe to call on an interval.
     */
    cleanup() {
        const now = Date.now();
        for (const [userId, timestamps] of this.userActivity.entries()) {
            const recent = timestamps.filter((t) => now - t <= this.timeWindowMs);
            if (recent.length === 0) {
                this.userActivity.delete(userId);
            } else {
                this.userActivity.set(userId, recent);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Anti-Link
// ---------------------------------------------------------------------------

const URL_REGEX = /(https?:\/\/[^\s]+)|(\bwww\.[^\s]+)/gi;

/**
 * Detects and evaluates links, with modular whitelist support for future use.
 */
class AntiLink {
    /**
     * @param {Object} [options]
     * @param {string[]} [options.whitelist=[]] - Domains that are always allowed
     */
    constructor(options = {}) {
        this.whitelist = new Set((options.whitelist || []).map((d) => d.toLowerCase()));
    }

    /**
     * Extracts all URLs found in a message string.
     * @param {string} content
     * @returns {string[]}
     */
    extractLinks(content) {
        if (!content) return [];
        const matches = content.match(URL_REGEX);
        return matches ? matches : [];
    }

    /**
     * Determines whether a domain is whitelisted.
     * @param {string} url
     * @returns {boolean}
     */
    isWhitelisted(url) {
        try {
            const normalized = url.startsWith('http') ? url : `http://${url}`;
            const hostname = new URL(normalized).hostname.toLowerCase();
            return this.whitelist.has(hostname);
        } catch {
            // If the URL can't be parsed, treat it as not whitelisted
            return false;
        }
    }

    /**
     * Checks a message's content for suspicious (non-whitelisted) links.
     *
     * @param {string} content
     * @returns {{ hasSuspiciousLink: boolean, links: string[], reason: string|null }}
     */
    checkMessage(content) {
        const links = this.extractLinks(content);

        if (links.length === 0) {
            return { hasSuspiciousLink: false, links: [], reason: null };
        }

        const suspiciousLinks = links.filter((link) => !this.isWhitelisted(link));

        return {
            hasSuspiciousLink: suspiciousLinks.length > 0,
            links: suspiciousLinks,
            reason:
                suspiciousLinks.length > 0
                    ? `Message contained ${suspiciousLinks.length} non-whitelisted link(s)`
                    : null,
        };
    }

    /**
     * Adds a domain to the whitelist at runtime.
     * @param {string} domain
     */
    addToWhitelist(domain) {
        this.whitelist.add(domain.toLowerCase());
    }

    /**
     * Removes a domain from the whitelist at runtime.
     * @param {string} domain
     */
    removeFromWhitelist(domain) {
        this.whitelist.delete(domain.toLowerCase());
    }
}

module.exports = {
    AntiSpam,
    AntiLink,
};
