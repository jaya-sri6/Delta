import { DeltaDatabase } from '../database.js';
import { Entity, EntityAlias } from '../../types/index.js';
import { randomUUID } from 'crypto';

export class EntityRepo {
  constructor(private db: DeltaDatabase) {}

  findOrCreate(canonicalName: string, entityType: string, metadata?: any): Entity {
    const existing = this.findByCanonicalName(canonicalName);
    if (existing) {
      return existing;
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const metaStr = metadata ? JSON.stringify(metadata) : null;

    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO entities (id, canonical_name, entity_type, first_mentioned_at, last_mentioned_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, canonicalName, entityType, now, now, metaStr);

      this.db.prepare(`
        INSERT INTO entity_aliases (id, entity_id, alias, is_canonical, created_at)
        VALUES (?, ?, ?, 1, ?)
      `).run(randomUUID(), id, canonicalName.toLowerCase(), now);
    });

    return {
      id,
      canonical_name: canonicalName,
      entity_type: entityType,
      first_mentioned_at: now,
      last_mentioned_at: now,
      metadata,
    };
  }

  findByCanonicalName(name: string): Entity | undefined {
    const row = this.db.prepare<any>(`
      SELECT id, canonical_name, entity_type, first_mentioned_at, last_mentioned_at, metadata
      FROM entities
      WHERE LOWER(canonical_name) = LOWER(?)
    `).get(name);

    if (!row) return undefined;
    return {
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  findByAlias(aliasText: string): Entity | undefined {
    const row = this.db.prepare<any>(`
      SELECT e.id, e.canonical_name, e.entity_type, e.first_mentioned_at, e.last_mentioned_at, e.metadata
      FROM entities e
      JOIN entity_aliases a ON e.id = a.entity_id
      WHERE LOWER(a.alias) = LOWER(?)
    `).get(aliasText);

    if (!row) return undefined;
    return {
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  addAlias(entityId: string, aliasText: string, isCanonical: boolean = false): void {
    const existing = this.findByAlias(aliasText);
    if (existing && existing.id === entityId) return;

    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO entity_aliases (id, entity_id, alias, is_canonical, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(randomUUID(), entityId, aliasText.toLowerCase(), isCanonical ? 1 : 0, new Date().toISOString());
    } catch {
      // Ignore unique constraint collision
    }
  }

  getById(id: string): Entity | undefined {
    const row = this.db.prepare<any>(`
      SELECT id, canonical_name, entity_type, first_mentioned_at, last_mentioned_at, metadata
      FROM entities
      WHERE id = ?
    `).get(id);

    if (!row) return undefined;
    return {
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  updateLastMentioned(id: string, timestamp?: string): void {
    this.db.prepare(`
      UPDATE entities
      SET last_mentioned_at = ?
      WHERE id = ?
    `).run(timestamp || new Date().toISOString(), id);
  }

  listAll(): Entity[] {
    const rows = this.db.prepare<any>(`
      SELECT id, canonical_name, entity_type, first_mentioned_at, last_mentioned_at, metadata
      FROM entities
      ORDER BY canonical_name ASC
    `).all();

    return rows.map(r => ({
      ...r,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }));
  }
}

