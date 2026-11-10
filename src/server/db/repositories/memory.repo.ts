import { DeltaDatabase } from '../database.js';
import { StructuredMemory } from '../../types/index.js';

export class MemoryRepo {
  constructor(private db: DeltaDatabase) {}

  create(memory: StructuredMemory): StructuredMemory {
    const metaStr = memory.metadata ? JSON.stringify(memory.metadata) : null;

    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO memories (id, user_id, conversation_id, memory_type, content, context_date, recorded_at, status, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        memory.id,
        memory.user_id,
        memory.conversation_id,
        memory.memory_type,
        memory.content,
        memory.context_date,
        memory.recorded_at,
        memory.status,
        metaStr
      );

      this.db.prepare(`
        INSERT INTO memories_fts (id, content)
        VALUES (?, ?)
      `).run(memory.id, memory.content);
    });

    return memory;
  }

  getByConversation(conversationId: string): StructuredMemory[] {
    const rows = this.db.prepare<any>(`
      SELECT id, user_id, conversation_id, memory_type, content, context_date, recorded_at, status, metadata
      FROM memories
      WHERE conversation_id = ?
      ORDER BY context_date ASC
    `).all(conversationId);

    return rows.map(r => ({
      ...r,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }));
  }

  getActiveMemories(userId: string, limit: number = 30): StructuredMemory[] {
    const rows = this.db.prepare<any>(`
      SELECT id, user_id, conversation_id, memory_type, content, context_date, recorded_at, status, metadata
      FROM memories
      WHERE user_id = ? AND status = 'ACTIVE'
      ORDER BY context_date DESC
      LIMIT ?
    `).all(userId, limit);

    return rows.map(r => ({
      ...r,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }));
  }

  searchFts(query: string, userId?: string): StructuredMemory[] {
    const cleanQuery = query.replace(/[^\w\s]/g, ' ').trim();
    if (!cleanQuery) return [];

    let sql = `
      SELECT m.*
      FROM memories m
      JOIN memories_fts fts ON m.id = fts.id
      WHERE fts.memories_fts MATCH ?
    `;
    const params: any[] = [cleanQuery];

    if (userId) {
      sql += ' AND m.user_id = ?';
      params.push(userId);
    }
    sql += ' ORDER BY m.context_date DESC';

    const rows = this.db.prepare<any>(sql).all(...params);
    return rows.map(r => ({
      ...r,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }));
  }
}

