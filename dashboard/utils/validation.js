/**
 * Sentinel-X Dashboard - Config validation helpers
 * -------------------------------------
 * Small, dependency-free validators used by guildConfigService.js before
 * anything is written to the shared config store. Keeping this separate
 * from the service functions means the validation rules are easy to find
 * and easy to unit test on their own.
 */

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
        this.status = 400;
    }
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Asserts every value in an object is a boolean, and (optionally) that
 * every key is one of an allowed set.
 * @param {Object} obj
 * @param {string[]|null} allowedKeys - pass null to allow any key
 * @param {string} label - used in error messages
 */
function assertBooleanMap(obj, allowedKeys, label) {
    if (!isPlainObject(obj)) throw new ValidationError(`${label} must be an object`);

    for (const [key, value] of Object.entries(obj)) {
        if (allowedKeys && !allowedKeys.includes(key)) {
            throw new ValidationError(`Unknown ${label} key: "${key}"`);
        }
        if (typeof value !== 'boolean') {
            throw new ValidationError(`${label}.${key} must be a boolean`);
        }
    }
}

/**
 * Asserts an array of Discord snowflake IDs (roles, channels, etc).
 * @param {string[]} arr
 * @param {string} label
 */
function assertSnowflakeArray(arr, label) {
    if (!Array.isArray(arr)) throw new ValidationError(`${label} must be an array`);

    for (const id of arr) {
        if (typeof id !== 'string' || !/^\d{15,25}$/.test(id)) {
            throw new ValidationError(`${label} contains an invalid Discord ID: "${id}"`);
        }
    }
}

/**
 * Asserts a map of category -> (Discord channel ID string or null).
 * @param {Object} obj
 * @param {string[]|null} allowedKeys
 * @param {string} label
 */
function assertChannelIdMap(obj, allowedKeys, label) {
    if (!isPlainObject(obj)) throw new ValidationError(`${label} must be an object`);

    for (const [key, value] of Object.entries(obj)) {
        if (allowedKeys && !allowedKeys.includes(key)) {
            throw new ValidationError(`Unknown ${label} key: "${key}"`);
        }
        if (value !== null && (typeof value !== 'string' || !/^\d{15,25}$/.test(value))) {
            throw new ValidationError(`${label}.${key} must be a Discord channel ID or null`);
        }
    }
}

module.exports = {
    ValidationError,
    isPlainObject,
    assertBooleanMap,
    assertSnowflakeArray,
    assertChannelIdMap,
};

