import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface Statement<T = any> {
  run(...params: any[]): RunResult;
  get(...params: any[]): T | undefined;
  all(...params: any[]): T[];
}

export class DeltaDatabase {
  private db: DatabaseSync;
  private readonly isMemory: boolean;

  constructor(dbPath: string = ':memory:') {
    this.isMemory = dbPath === ':memory:';
    if (!this.isMemory) {
      const dir = path.dirname(path.resolve(dbPath));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.db = new DatabaseSync(path.resolve(dbPath));
    } else {
      this.db = new DatabaseSync(':memory:');
    }

    // Set pragmas for performance and consistency
    this.db.exec('PRAGMA foreign_keys = ON;');
    if (!this.isMemory) {
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');
    }
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare<T = any>(sql: string): Statement<T> {
    const stmt = this.db.prepare(sql);
    return {
      run: (...params: any[]) => {
        // Flatten array if single array passed
        const args = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        return stmt.run(...args) as RunResult;
      },
      get: (...params: any[]) => {
        const args = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const res = stmt.get(...args);
        return res as T | undefined;
      },
      all: (...params: any[]) => {
        const args = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        return stmt.all(...args) as T[];
      },
    };
  }

  transaction<T>(fn: () => T): T {
    this.exec('BEGIN TRANSACTION;');
    try {
      const result = fn();
      this.exec('COMMIT;');
      return result;
    } catch (err) {
      this.exec('ROLLBACK;');
      throw err;
    }
  }

  initSchema(schemaPath?: string): void {
    const resolvedPath = schemaPath || path.resolve(process.cwd(), 'src/server/db/schema.sql');
    if (fs.existsSync(resolvedPath)) {
      const sql = fs.readFileSync(resolvedPath, 'utf-8');
      this.exec(sql);
    } else {
      throw new Error(`Schema file not found at ${resolvedPath}`);
    }
  }

  close(): void {
    this.db.close();
  }
}

let defaultDb: DeltaDatabase | null = null;

export function getDatabase(dbPath?: string): DeltaDatabase {
  if (!defaultDb) {
    const targetPath = dbPath || process.env.DATABASE_PATH || './data/delta.db';
    defaultDb = new DeltaDatabase(targetPath);
    defaultDb.initSchema();
  }
  return defaultDb;
}

export function createTestDatabase(): DeltaDatabase {
  const db = new DeltaDatabase(':memory:');
  db.initSchema();
  return db;
}

