import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { encrypt, decrypt } from '../utils/crypto';
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
        return db;
      });
    }
    return this.dbPromise;
  }

  /**
   * List all saved Git connection profiles (decrypted)
   */
  async listConnections(): Promise<GitConnectionInfo[]> {
    const db = await this.getDb();
    const rows = await db.all<any[]>('SELECT * FROM connections ORDER BY id DESC');
    return rows.map(row => {
      let parsedOptions = {};
      try {
        parsedOptions = JSON.parse(row.options || '{}');
      } catch (e) {
        parsedOptions = {};
      }
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
    const optionsStr = typeof options === 'string' ? options : JSON.stringify(options || {});

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

    let parsedOptions = {};
    try {
      parsedOptions = JSON.parse(row.options || '{}');
    } catch (e) {
      parsedOptions = {};
    }

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
