import { DeltaDatabase } from '../database.js';
import { Conversation, Message, ActivityStep } from '../../types/index.js';

export class ConversationRepo {
  constructor(private db: DeltaDatabase) {}

  create(conversation: Conversation): Conversation {
    this.db.prepare(`
      INSERT INTO conversations (id, user_id, title, created_at, updated_at, is_demo)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      conversation.id,
      conversation.user_id,
      conversation.title,
      conversation.created_at,
      conversation.updated_at,
      conversation.is_demo ? 1 : 0
    );
    return conversation;
  }

  getById(id: string): Conversation | undefined {
    return this.db.prepare<Conversation>(`
      SELECT id, user_id, title, created_at, updated_at, is_demo
      FROM conversations
      WHERE id = ?
    `).get(id);
  }

  listByUser(userId: string): Conversation[] {
    return this.db.prepare<Conversation>(`
      SELECT id, user_id, title, created_at, updated_at, is_demo
      FROM conversations
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `).all(userId);
  }

  updateTitle(id: string, title: string): void {
    this.db.prepare(`
      UPDATE conversations
      SET title = ?, updated_at = ?
      WHERE id = ?
    `).run(title, new Date().toISOString(), id);
  }

  updateTimestamp(id: string, timestamp?: string): void {
    this.db.prepare(`
      UPDATE conversations
      SET updated_at = ?
      WHERE id = ?
    `).run(timestamp || new Date().toISOString(), id);
  }

  delete(id: string): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
    });
  }

  search(query: string, userId: string): Conversation[] {
    const cleanQuery = query.replace(/[^\w\s]/g, ' ').trim();
    if (!cleanQuery) return this.listByUser(userId);

    // Search both conversation titles and message content via FTS5 subquery
    return this.db.prepare<Conversation>(`
      SELECT DISTINCT c.*
      FROM conversations c
      WHERE c.user_id = ? AND (
        c.title LIKE ? OR c.id IN (
          SELECT m.conversation_id
          FROM messages m
          WHERE m.id IN (SELECT id FROM messages_fts WHERE messages_fts MATCH ?)
        )
      )
      ORDER BY c.updated_at DESC
    `).all(userId, `%${query}%`, cleanQuery);
  }
}

export class MessageRepo {
  constructor(private db: DeltaDatabase) {}

  create(message: Message): Message {
    const activityLogStr = typeof message.activity_log === 'object'
      ? JSON.stringify(message.activity_log)
      : message.activity_log || null;

    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO messages (id, conversation_id, role, content, created_at, activity_log, research_session_id, token_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        message.id,
        message.conversation_id,
        message.role,
        message.content,
        message.created_at,
        activityLogStr,
        message.research_session_id || null,
        message.token_count || 0
      );

      // Index in FTS5
      this.db.prepare(`
        INSERT INTO messages_fts (id, content)
        VALUES (?, ?)
      `).run(message.id, message.content);

      // Update conversation updated_at
      this.db.prepare(`
        UPDATE conversations
        SET updated_at = ?
        WHERE id = ?
      `).run(message.created_at, message.conversation_id);
    });

    return message;
  }

  getByConversation(conversationId: string): Message[] {
    const rows = this.db.prepare<any>(`
      SELECT id, conversation_id, role, content, created_at, activity_log, research_session_id, token_count
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `).all(conversationId);

    return rows.map(r => ({
      ...r,
      activity_log: r.activity_log ? JSON.parse(r.activity_log) : undefined
    }));
  }

  getById(id: string): Message | undefined {
    const row = this.db.prepare<any>(`
      SELECT id, conversation_id, role, content, created_at, activity_log, research_session_id, token_count
      FROM messages
      WHERE id = ?
    `).get(id);

    if (!row) return undefined;
    return {
      ...row,
      activity_log: row.activity_log ? JSON.parse(row.activity_log) : undefined
    };
  }

  searchFts(query: string, conversationId?: string): Message[] {
    const cleanQuery = query.replace(/[^\w\s]/g, ' ').trim();
    if (!cleanQuery) return [];

    let sql = `
      SELECT m.*
      FROM messages m
      JOIN messages_fts fts ON m.id = fts.id
      WHERE fts.messages_fts MATCH ?
    `;
    const params: any[] = [cleanQuery];

    if (conversationId) {
      sql += ' AND m.conversation_id = ?';
      params.push(conversationId);
    }
    sql += ' ORDER BY m.created_at DESC';

    const rows = this.db.prepare<any>(sql).all(...params);
    return rows.map(r => ({
      ...r,
      activity_log: r.activity_log ? JSON.parse(r.activity_log) : undefined
    }));
  }
}
