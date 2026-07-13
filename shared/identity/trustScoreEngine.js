/**
 * Sentinel-X - Trust Score Engine (SHARED)
 * -------------------------------------
 * A pure function: given a set of inputs about a user and a set of
 * configurable weights, produces a trust score and a breakdown of how it
 * was reached. No storage, no Discord/Roblox API calls, no side effects -
 * every value it needs is passed in, which is what makes this fully unit
 * testable and keeps scoring logic in exactly one place.
 *
 * Weights come from a guild's config (shared/guildConfigStore.js's
 * `identity.trustScoreWeights`, defaulting to DEFAULT_IDENTITY_WEIGHTS) or
 * from the platform-wide default when no guild context applies (e.g. a
 * user's global identity profile page, which isn't scoped to one server).
 * This module never hardcodes a point value itself.
 */

/**
 * @typedef {Object} TrustScoreInputs
 * @property {number} discordAccountAgeDays
 * @property {number|null} robloxAccountAgeDays - null if Roblox isn't linked
 * @property {number} verifiedProviderCount - how many providers are linked+verified
 * @property {number} serverTenureDays - days since joining the guild in question (0 if unknown)
 * @property {number} moderationIncidentCount - count of past moderation actions against this user
 */

/**
 * @typedef {Object} TrustScoreWeights
 * @property {number} minScore
 * @property {number} maxScore
 * @property {number} baseScore
 * @property {{pointsPerDay: number, maxPoints: number}} discordAccountAge
 * @property {{pointsPerDay: number, maxPoints: number}} robloxAccountAge
 * @property {{pointsPerProvider: number, maxPoints: number}} verifiedProviders
 * @property {{pointsPerDay: number, maxPoints: number}} serverTenure
 * @property {{pointsPerIncident: number, maxPenalty: number}} moderationHistory
 */

/**
 * Clamps a value between a min and max (min may be negative, as with
 * moderationHistory's penalty cap).
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Computes one weighted factor, capped at its configured max contribution.
 * For penalty-style factors (negative pointsPer*), "max" is actually a
 * floor (e.g. -30), so we clamp toward zero from below instead of above.
 */
function boundedContribution(rawPoints, cap) {
    if (cap < 0) {
        return clamp(rawPoints, cap, 0);
    }
    return clamp(rawPoints, 0, cap);
}

/**
 * Computes a trust score from inputs and configurable weights.
 *
 * @param {TrustScoreInputs} inputs
 * @param {TrustScoreWeights} weights
 * @returns {{ score: number, breakdown: Record<string, number> }}
 */
function computeTrustScore(inputs, weights) {
    const breakdown = {};

    breakdown.discordAccountAge = boundedContribution(
        inputs.discordAccountAgeDays * weights.discordAccountAge.pointsPerDay,
        weights.discordAccountAge.maxPoints
    );

    breakdown.robloxAccountAge = inputs.robloxAccountAgeDays == null
        ? 0
        : boundedContribution(
            inputs.robloxAccountAgeDays * weights.robloxAccountAge.pointsPerDay,
            weights.robloxAccountAge.maxPoints
        );

    breakdown.verifiedProviders = boundedContribution(
        inputs.verifiedProviderCount * weights.verifiedProviders.pointsPerProvider,
        weights.verifiedProviders.maxPoints
    );

    breakdown.serverTenure = boundedContribution(
        inputs.serverTenureDays * weights.serverTenure.pointsPerDay,
        weights.serverTenure.maxPoints
    );

    breakdown.moderationHistory = boundedContribution(
        inputs.moderationIncidentCount * weights.moderationHistory.pointsPerIncident,
        weights.moderationHistory.maxPenalty
    );

    const rawTotal = weights.baseScore + Object.values(breakdown).reduce((sum, v) => sum + v, 0);
    const score = Math.round(clamp(rawTotal, weights.minScore, weights.maxScore));

    return { score, breakdown };
}

/**
 * Converts a Discord snowflake ID into an account-age-in-days figure,
 * since Discord IDs encode their creation timestamp. Kept here as a small
 * shared helper since both the Discord and Roblox age calculations reduce
 * to the same "days since a timestamp" arithmetic.
 * @param {string} snowflake
 * @returns {number}
 */
function daysSinceDiscordSnowflake(snowflake) {
    const DISCORD_EPOCH = 1420070400000n; // 2015-01-01T00:00:00.000Z
    const timestampMs = Number((BigInt(snowflake) >> 22n) + DISCORD_EPOCH);
    return daysSince(timestampMs);
}

/**
 * @param {number|string} timestamp - epoch ms or ISO string
 * @returns {number}
 */
function daysSince(timestamp) {
    const then = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
    return Math.max(0, (Date.now() - then) / 86_400_000);
}

module.exports = {
    computeTrustScore,
    daysSinceDiscordSnowflake,
    daysSince,
};

