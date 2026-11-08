import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { encrypt, decrypt, isEncrypted } from '../utils/crypto';
import path from 'path';
import fs from 'fs';

const isProd = process.env.NODE_ENV === 'production';
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../data');
const DB_PATH = path.join(dataDir, isProd ? 'connections.db?nolock=1' : 'connections.db');

export interface GitConnectionInfo {
  id?: number;
  name: string;
  uri: string;
  options?: any;
  createdAt?: string;
}

/**
 * Options hold credentials (gitToken, gitUsername…), so the whole JSON blob is
 * encrypted at rest. Legacy rows stored as plain JSON are still readable and
 * get encrypted on the next save (or by the startup migration below).
 */
function parseOptions(raw: string | null | undefined): any {
  if (!raw) return {};
  try {
    const json = isEncrypted(raw) ? decrypt(raw) : raw;
    return JSON.parse(json || '{}');
  } catch (e) {
    return {};
  }
}

function serializeOptions(options: any): string {
  const obj = typeof options === 'string' ? parseOptions(options) : (options || {});
  return encrypt(JSON.stringify(obj));
}

export class ConnectionStore {
  private dbPromise: Promise<Database> | null = null;

  private async getDb(): Promise<Database> {
    if (!this.dbPromise) {
      // Ensure data directory exists
      const dataDir = path.dirname(DB_PATH);
      if (!fs.existsSync(dataDir)) {
        try {
          fs.mkdirSync(dataDir, { recursive: true });
        } catch (e: any) {
          console.error(`Failed to create data directory at ${dataDir}:`, e.message || e);
        }
      }

      const dbFilename = 'file:' + DB_PATH;
      this.dbPromise = open({
        filename: dbFilename,
        driver: sqlite3.Database,
        mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE | sqlite3.OPEN_URI
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
        await this.migrateLegacyRows(db);
        return db;
      });
    }
    return this.dbPromise;
  }

  /**
   * Re-encrypt rows written with older formats (plain-text options / CBC URIs).
   */
  private async migrateLegacyRows(db: Database): Promise<void> {
    try {
      const rows = await db.all<any[]>('SELECT id, uri, options FROM connections');
      for (const row of rows) {
        const needsOptions = row.options && !String(row.options).startsWith('v2:');
        const needsUri = row.uri && !String(row.uri).startsWith('v2:');
        if (!needsOptions && !needsUri) continue;
        const uri = decrypt(row.uri);
        const options = parseOptions(row.options);
        if (!uri) continue; // cannot decrypt — leave untouched
        await db.run('UPDATE connections SET uri = ?, options = ? WHERE id = ?', encrypt(uri), serializeOptions(options), row.id);
      }
    } catch (e: any) {
      console.warn('[ConnectionStore] Credential migration skipped:', e.message || e);
    }
  }

  /**
   * List all saved Git connection profiles (decrypted)
   */
  async listConnections(): Promise<GitConnectionInfo[]> {
    const db = await this.getDb();
    const rows = await db.all<any[]>('SELECT * FROM connections ORDER BY id DESC');
    return rows.map(row => {
      const parsedOptions = parseOptions(row.options);
      return {
        id: row.id,
        name: row.name,
        uri: decrypt(row.uri),
        options: parsedOptions,
        createdAt: row.createdAt
      };
    });
  }

  /**
   * Save or update a connection profile
   */
  async saveConnection(name: string, uri: string, options: any = {}): Promise<GitConnectionInfo> {
    const db = await this.getDb();
    const encryptedUri = encrypt(uri);
    const optionsStr = serializeOptions(options);

    // Check if name already exists
    const existing = await db.get('SELECT id FROM connections WHERE name = ?', name);
    if (existing) {
      await db.run('UPDATE connections SET uri = ?, options = ? WHERE name = ?', encryptedUri, optionsStr, name);
      return { id: existing.id, name, uri, options };
    } else {
      const result = await db.run(
        'INSERT INTO connections (name, uri, options) VALUES (?, ?, ?)',
        name,
        encryptedUri,
        optionsStr
      );
      return { id: result.lastID, name, uri, options };
    }
  }

  /**
   * Get a saved connection profile by ID or name
   */
  async getConnection(idOrName: number | string): Promise<GitConnectionInfo | null> {
    const db = await this.getDb();
    let row;
    if (typeof idOrName === 'number') {
      row = await db.get<any>('SELECT * FROM connections WHERE id = ?', idOrName);
    } else {
      row = await db.get<any>('SELECT * FROM connections WHERE name = ?', idOrName);
    }

    if (!row) return null;

    const parsedOptions = parseOptions(row.options);

    return {
      id: row.id,
      name: row.name,
      uri: decrypt(row.uri),
      options: parsedOptions,
      createdAt: row.createdAt
    };
  }

  /**
   * Delete a connection profile
   */
  async deleteConnection(name: string): Promise<boolean> {
    const db = await this.getDb();
    const result = await db.run('DELETE FROM connections WHERE name = ?', name);
    return (result.changes ?? 0) > 0;
  }
}

export const connectionStore = new ConnectionStore();
