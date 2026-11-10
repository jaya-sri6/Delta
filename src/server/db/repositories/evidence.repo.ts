import { DeltaDatabase } from '../database.js';
import { Evidence, EvidenceType, CredibilityCategory } from '../../types/index.js';
import { randomUUID } from 'crypto';

export class EvidenceRepo {
  constructor(private db: DeltaDatabase) {}

  createSession(conversationId: string, intent: string, plan: any): string {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO research_sessions (id, conversation_id, intent, plan, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, conversationId, intent, JSON.stringify(plan), new Date().toISOString());
    return id;
  }

  recordQuery(sessionId: string, query: string, topic: string = 'general', searchDepth: string = 'basic', resultsCount: number = 0): string {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO research_queries (id, session_id, query, topic, search_depth, results_count, executed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, sessionId, query, topic, searchDepth, resultsCount, new Date().toISOString());
    return id;
  }

  saveEvidence(evidence: Evidence): Evidence {
    // Check if URL already exists in evidence to prevent duplicate identical entries
    const existing = this.getByUrl(evidence.url);
    if (existing) {
      return existing;
    }

    this.db.prepare(`
      INSERT INTO evidence (
        id, research_session_id, entity_id, title, url, domain,
        snippet, publication_date, event_date, retrieved_at,
        evidence_type, credibility_category, score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      evidence.id,
      evidence.research_session_id || null,
      evidence.entity_id || null,
      evidence.title,
      evidence.url,
      evidence.domain,
      evidence.snippet,
      evidence.publication_date || null,
      evidence.event_date || null,
      evidence.retrieved_at,
      evidence.evidence_type,
      evidence.credibility_category,
      evidence.score || 0
    );

    return evidence;
  }

  getById(id: string): Evidence | undefined {
    return this.db.prepare<Evidence>(`
      SELECT * FROM evidence WHERE id = ?
    `).get(id);
  }

  getByUrl(url: string): Evidence | undefined {
    return this.db.prepare<Evidence>(`
      SELECT * FROM evidence WHERE url = ?
    `).get(url);
  }

  getBySession(sessionId: string): Evidence[] {
    return this.db.prepare<Evidence>(`
      SELECT * FROM evidence WHERE research_session_id = ?
    `).all(sessionId);
  }

  getByEntity(entityId: string): Evidence[] {
    return this.db.prepare<Evidence>(`
      SELECT * FROM evidence WHERE entity_id = ?
      ORDER BY retrieved_at DESC
    `).all(entityId);
  }
}

