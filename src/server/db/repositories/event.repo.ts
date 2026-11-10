import { DeltaDatabase } from '../database.js';
import { MemoryEvent, EventRelationshipType } from '../../types/index.js';
import { randomUUID } from 'crypto';

export class EventRepo {
  constructor(private db: DeltaDatabase) {}

  create(event: MemoryEvent, entityIds: string[] = [], relatedEventIds: Array<{ targetId: string; type: EventRelationshipType }> = []): MemoryEvent {
    const metaStr = event.metadata ? JSON.stringify(event.metadata) : null;

    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO events (id, user_id, conversation_id, source_message_id, event_type, description, event_time, recorded_at, confidence, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        event.id,
        event.user_id,
        event.conversation_id,
        event.source_message_id || null,
        event.event_type,
        event.description,
        event.event_time,
        event.recorded_at,
        event.confidence,
        metaStr
      );

      // Index in FTS5
      this.db.prepare(`
        INSERT INTO events_fts (id, description)
        VALUES (?, ?)
      `).run(event.id, event.description);

      // Link entities
      for (const entityId of entityIds) {
        this.db.prepare(`
          INSERT OR IGNORE INTO event_entities (event_id, entity_id)
          VALUES (?, ?)
        `).run(event.id, entityId);
      }

      // Link relationships
      for (const rel of relatedEventIds) {
        this.db.prepare(`
          INSERT INTO event_relationships (id, source_event_id, target_event_id, relationship_type, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(randomUUID(), event.id, rel.targetId, rel.type, new Date().toISOString());
      }
    });

    return event;
  }

  getByConversation(conversationId: string): MemoryEvent[] {
    const rows = this.db.prepare<any>(`
      SELECT id, user_id, conversation_id, source_message_id, event_type, description, event_time, recorded_at, confidence, metadata
      FROM events
      WHERE conversation_id = ?
      ORDER BY event_time ASC
    `).all(conversationId);

    return rows.map(r => this.hydrateEvent(r));
  }

  getByTimeRange(start: string, end: string, userId?: string): MemoryEvent[] {
    let sql = `
      SELECT id, user_id, conversation_id, source_message_id, event_type, description, event_time, recorded_at, confidence, metadata
      FROM events
      WHERE event_time >= ? AND event_time <= ?
    `;
    const params: any[] = [start, end];

    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }
    sql += ' ORDER BY event_time ASC';

    const rows = this.db.prepare<any>(sql).all(...params);
    return rows.map(r => this.hydrateEvent(r));
  }

  getByEntity(entityId: string): MemoryEvent[] {
    const rows = this.db.prepare<any>(`
      SELECT e.*
      FROM events e
      JOIN event_entities ee ON e.id = ee.event_id
      WHERE ee.entity_id = ?
      ORDER BY e.event_time DESC
    `).all(entityId);

    return rows.map(r => this.hydrateEvent(r));
  }

  getRecentEvents(userId: string, limit: number = 20): MemoryEvent[] {
    const rows = this.db.prepare<any>(`
      SELECT id, user_id, conversation_id, source_message_id, event_type, description, event_time, recorded_at, confidence, metadata
      FROM events
      WHERE user_id = ?
      ORDER BY event_time DESC
      LIMIT ?
    `).all(userId, limit);

    return rows.map(r => this.hydrateEvent(r));
  }

  searchFts(query: string, userId?: string): MemoryEvent[] {
    const cleanQuery = query.replace(/[^\w\s]/g, ' ').trim();
    if (!cleanQuery) return [];

    let sql = `
      SELECT e.*
      FROM events e
      JOIN events_fts fts ON e.id = fts.id
      WHERE fts.events_fts MATCH ?
    `;
    const params: any[] = [cleanQuery];

    if (userId) {
      sql += ' AND e.user_id = ?';
      params.push(userId);
    }
    sql += ' ORDER BY e.event_time DESC';

    const rows = this.db.prepare<any>(sql).all(...params);
    return rows.map(r => this.hydrateEvent(r));
  }

  private hydrateEvent(row: any): MemoryEvent {
    // Fetch attached entity canonical names
    const entityRows = this.db.prepare<any>(`
      SELECT ent.canonical_name
      FROM event_entities ee
      JOIN entities ent ON ee.entity_id = ent.id
      WHERE ee.event_id = ?
    `).all(row.id);

    return {
      id: row.id,
      user_id: row.user_id,
      conversation_id: row.conversation_id,
      source_message_id: row.source_message_id || undefined,
      event_type: row.event_type,
      description: row.description,
      event_time: row.event_time,
      recorded_at: row.recorded_at,
      confidence: row.confidence,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      entities: entityRows.map(er => er.canonical_name),
    };
  }
}

