"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectionStore = exports.ConnectionStore = void 0;
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const crypto_1 = require("../utils/crypto");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const isProd = process.env.NODE_ENV === 'production';
const dataDir = process.env.DATA_DIR || path_1.default.join(__dirname, '../../data');
const DB_PATH = path_1.default.join(dataDir, isProd ? 'connections.db?nolock=1' : 'connections.db');
class ConnectionStore {
    dbPromise = null;
    async getDb() {
        if (!this.dbPromise) {
            // Ensure data directory exists
            const dataDir = path_1.default.dirname(DB_PATH);
            if (!fs_1.default.existsSync(dataDir)) {
                try {
                    fs_1.default.mkdirSync(dataDir, { recursive: true });
                }
                catch (e) {
                    console.error(`Failed to create data directory at ${dataDir}:`, e.message || e);
                }
            }
            const dbFilename = 'file:' + DB_PATH;
            this.dbPromise = (0, sqlite_1.open)({
                filename: dbFilename,
                driver: sqlite3_1.default.Database,
                mode: sqlite3_1.default.OPEN_READWRITE | sqlite3_1.default.OPEN_CREATE | sqlite3_1.default.OPEN_URI
            }).then(async (db) => {
                // Initialize schema
                await db.exec(`
          CREATE TABLE IF NOT EXISTS connections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            uri TEXT NOT NULL,
            options TEXT DEFAULT '{}',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
                return db;
            });
        }
        return this.dbPromise;
    }
    /**
     * List all saved Git connection profiles (decrypted)
     */
    async listConnections() {
        const db = await this.getDb();
        const rows = await db.all('SELECT * FROM connections ORDER BY id DESC');
        return rows.map(row => {
            let parsedOptions = {};
            try {
                parsedOptions = JSON.parse(row.options || '{}');
            }
            catch (e) {
                parsedOptions = {};
            }
            return {
                id: row.id,
                name: row.name,
                uri: (0, crypto_1.decrypt)(row.uri),
                options: parsedOptions,
                createdAt: row.createdAt
            };
        });
    }
    /**
     * Save or update a connection profile
     */
    async saveConnection(name, uri, options = {}) {
        const db = await this.getDb();
        const encryptedUri = (0, crypto_1.encrypt)(uri);
        const optionsStr = typeof options === 'string' ? options : JSON.stringify(options || {});
        // Check if name already exists
        const existing = await db.get('SELECT id FROM connections WHERE name = ?', name);
        if (existing) {
            await db.run('UPDATE connections SET uri = ?, options = ? WHERE name = ?', encryptedUri, optionsStr, name);
            return { id: existing.id, name, uri, options };
        }
        else {
            const result = await db.run('INSERT INTO connections (name, uri, options) VALUES (?, ?, ?)', name, encryptedUri, optionsStr);
            return { id: result.lastID, name, uri, options };
        }
    }
    /**
     * Get a saved connection profile by ID or name
     */
    async getConnection(idOrName) {
        const db = await this.getDb();
        let row;
        if (typeof idOrName === 'number') {
            row = await db.get('SELECT * FROM connections WHERE id = ?', idOrName);
        }
        else {
            row = await db.get('SELECT * FROM connections WHERE name = ?', idOrName);
        }
        if (!row)
            return null;
        let parsedOptions = {};
        try {
            parsedOptions = JSON.parse(row.options || '{}');
        }
        catch (e) {
            parsedOptions = {};
        }
        return {
            id: row.id,
            name: row.name,
            uri: (0, crypto_1.decrypt)(row.uri),
            options: parsedOptions,
            createdAt: row.createdAt
        };
    }
    /**
     * Delete a connection profile
     */
    async deleteConnection(name) {
        const db = await this.getDb();
        const result = await db.run('DELETE FROM connections WHERE name = ?', name);
        return (result.changes ?? 0) > 0;
    }
}
exports.ConnectionStore = ConnectionStore;
exports.connectionStore = new ConnectionStore();
