/**
 * Sentinel-X - JSON File Store (shared low-level utility)
 * -------------------------------------
 * Generic atomic read/write for a single JSON file used as a lightweight
 * key-value table. No native/compiled dependency (see the better-sqlite3
 * build-failure history on Render), so it installs and runs anywhere
 * Node does, in either the bot process or the dashboard process.
 *
 * This file knows nothing about "guild config" or "logs" - it's pure
 * storage plumbing. Schema-aware stores (guildConfigStore.js,
 * recentLogsStore.js) are built on top of a JsonStore instance.
 */

const fs = require('fs');
const path = require('path');

class JsonStore {
    /**
     * @param {string} filePath - absolute path to the JSON file backing this store
     */
    constructor(filePath) {
        this.filePath = filePath;
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /** Reads and parses the entire file, returning {} if missing/corrupt. */
    readAll() {
        try {
            if (!fs.existsSync(this.filePath)) return {};
            const raw = fs.readFileSync(this.filePath, 'utf8');
            return raw.trim() ? JSON.parse(raw) : {};
        } catch (error) {
            console.error(`[Sentinel-X] Failed to read ${this.filePath}, starting fresh:`, error.message);
            return {};
        }
    }

    /** Atomically writes the entire object back to disk (temp file + rename). */
    writeAll(data) {
        const tmpFile = `${this.filePath}.tmp`;
        fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tmpFile, this.filePath);
    }

    /** @param {string} key */
    get(key) {
        return this.readAll()[key];
    }

    /**
     * @param {string} key
     * @param {*} value
     */
    set(key, value) {
        const data = this.readAll();
        data[key] = value;
        this.writeAll(data);
        return value;
    }

    /** @param {string} key */
    delete(key) {
        const data = this.readAll();
        delete data[key];
        this.writeAll(data);
    }
}

module.exports = { JsonStore };
