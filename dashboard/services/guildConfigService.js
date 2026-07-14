/**
 * Sentinel-X Dashboard - Guild Configuration Service
 * -------------------------------------
 * All business logic for reading/writing guild configuration lives here,
 * not in the route files. Routes just extract params/body and call these
 * functions; this module validates input and delegates persistence to
 * shared/guildConfigStore.js - the same store the bot process reads from.
 */

const sharedStore = require('../../shared/guildConfigStore');
const {
    ValidationError,
    isPlainObject,
    assertSnowflakeArray,
    assertChannelIdMap,
    assertBooleanMap,
    assertSecurityPatch,
} = require('../utils/validation');

/**
 * @param {string} guildId
 * @param {string} guildName
 */
function getConfig(guildId, guildName) {
    return sharedStore.getGuildConfig(guildId, guildName);
}

/**
 * Updates one or more security modules - each can adjust its on/off state
 * and/or individual action toggles (e.g. delete/warn/timeout).
 * @param {string} guildId
 * @param {string} guildName
 * @param {Object} patch - e.g. { antiRaid: { enabled: false }, antiSpam: { actions: { timeout: false } } }
 */
function updateSecurity(guildId, guildName, patch) {
    assertSecurityPatch(patch, sharedStore.SECURITY_MODULES, sharedStore.SECURITY_ACTIONS);
    return sharedStore.saveGuildConfig(guildId, guildName, { security: patch });
}

/**
 * Updates moderation settings: trusted roles, per-module thresholds, and
 * per-module punishment overrides.
 * @param {string} guildId
 * @param {string} guildName
 * @param {{ trustedRoles?: string[], thresholds?: Object, punishments?: Object }} patch
 */
function updateModeration(guildId, guildName, patch) {
    if (!isPlainObject(patch)) throw new ValidationError('moderation payload must be an object');

    const moderationPatch = {};

    if (patch.trustedRoles !== undefined) {
        assertSnowflakeArray(patch.trustedRoles, 'moderation.trustedRoles');
        moderationPatch.trustedRoles = patch.trustedRoles;
    }

    if (patch.thresholds !== undefined) {
        if (!isPlainObject(patch.thresholds)) {
            throw new ValidationError('moderation.thresholds must be an object');
        }
        for (const moduleName of Object.keys(patch.thresholds)) {
            if (!sharedStore.SECURITY_MODULES.includes(moduleName)) {
                throw new ValidationError(`Unknown module in thresholds: "${moduleName}"`);
            }
            if (!isPlainObject(patch.thresholds[moduleName])) {
                throw new ValidationError(`thresholds.${moduleName} must be an object`);
            }
        }
        moderationPatch.thresholds = patch.thresholds;
    }

    if (patch.punishments !== undefined) {
        if (!isPlainObject(patch.punishments)) {
            throw new ValidationError('moderation.punishments must be an object');
        }
        for (const moduleName of Object.keys(patch.punishments)) {
            if (!sharedStore.SECURITY_MODULES.includes(moduleName)) {
                throw new ValidationError(`Unknown module in punishments: "${moduleName}"`);
            }
            if (!isPlainObject(patch.punishments[moduleName])) {
                throw new ValidationError(`punishments.${moduleName} must be an object`);
            }
        }
        moderationPatch.punishments = patch.punishments;
    }

    return sharedStore.saveGuildConfig(guildId, guildName, { moderation: moderationPatch });
}

/**
 * Updates logging settings: which categories are enabled and which
 * channel each category posts to.
 * @param {string} guildId
 * @param {string} guildName
 * @param {{ enabledCategories?: Object, channels?: Object }} patch
 */
function updateLogging(guildId, guildName, patch) {
    if (!isPlainObject(patch)) throw new ValidationError('logging payload must be an object');

    const loggingPatch = {};

    if (patch.enabledCategories !== undefined) {
        assertBooleanMap(patch.enabledCategories, sharedStore.LOG_CATEGORIES, 'logging.enabledCategories');
        loggingPatch.enabledCategories = patch.enabledCategories;
    }

    if (patch.channels !== undefined) {
        assertChannelIdMap(patch.channels, sharedStore.LOG_CATEGORIES, 'logging.channels');
        loggingPatch.channels = patch.channels;
    }

    return sharedStore.saveGuildConfig(guildId, guildName, { logging: loggingPatch });
}

/**
 * Updates command configuration: category toggles, individual command
 * toggles, and arbitrary per-command settings.
 * @param {string} guildId
 * @param {string} guildName
 * @param {{ categories?: Object, individual?: Object, settings?: Object }} patch
 */
function updateCommands(guildId, guildName, patch) {
    if (!isPlainObject(patch)) throw new ValidationError('commands payload must be an object');

    const commandsPatch = {};

    if (patch.categories !== undefined) {
        assertBooleanMap(patch.categories, null, 'commands.categories');
        commandsPatch.categories = patch.categories;
    }

    if (patch.individual !== undefined) {
        assertBooleanMap(patch.individual, null, 'commands.individual');
        commandsPatch.individual = patch.individual;
    }

    if (patch.settings !== undefined) {
        if (!isPlainObject(patch.settings)) {
            throw new ValidationError('commands.settings must be an object');
        }
        commandsPatch.settings = patch.settings;
    }

    return sharedStore.saveGuildConfig(guildId, guildName, { commands: commandsPatch });
}

module.exports = {
    getConfig,
    updateSecurity,
    updateModeration,
    updateLogging,
    updateCommands,
};
