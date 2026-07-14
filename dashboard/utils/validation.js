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

/**
 * Asserts a security config patch matches the { [moduleName]: { enabled?,
 * actions? } } shape - module names and action names are both checked
 * against the canonical lists so a typo becomes a clear 400, not a
 * silently-ignored no-op.
 * @param {Object} patch
 * @param {string[]} allowedModules - shared/guildConfigStore.js SECURITY_MODULES
 * @param {Object} allowedActionsByModule - shared/guildConfigStore.js SECURITY_ACTIONS
 */
function assertSecurityPatch(patch, allowedModules, allowedActionsByModule) {
    if (!isPlainObject(patch)) throw new ValidationError('security must be an object');

    for (const [moduleName, value] of Object.entries(patch)) {
        if (!allowedModules.includes(moduleName)) {
            throw new ValidationError(`Unknown security module: "${moduleName}"`);
        }
        if (!isPlainObject(value)) {
            throw new ValidationError(`security.${moduleName} must be an object`);
        }

        for (const key of Object.keys(value)) {
            if (key !== 'enabled' && key !== 'actions') {
                throw new ValidationError(`Unknown key "${key}" in security.${moduleName} - expected "enabled" and/or "actions"`);
            }
        }

        if (value.enabled !== undefined && typeof value.enabled !== 'boolean') {
            throw new ValidationError(`security.${moduleName}.enabled must be a boolean`);
        }

        if (value.actions !== undefined) {
            if (!isPlainObject(value.actions)) {
                throw new ValidationError(`security.${moduleName}.actions must be an object`);
            }

            const allowedActions = allowedActionsByModule[moduleName]
                ? Object.keys(allowedActionsByModule[moduleName])
                : null;

            for (const [actionName, actionValue] of Object.entries(value.actions)) {
                if (allowedActions && !allowedActions.includes(actionName)) {
                    throw new ValidationError(`Unknown action "${actionName}" for module "${moduleName}"`);
                }
                if (typeof actionValue !== 'boolean') {
                    throw new ValidationError(`security.${moduleName}.actions.${actionName} must be a boolean`);
                }
            }
        }
    }
}

module.exports = {
    ValidationError,
    isPlainObject,
    assertBooleanMap,
    assertSnowflakeArray,
    assertChannelIdMap,
    assertSecurityPatch,
};
