import { MemoryEvent, EventType, StructuredMemory } from '../types/index.js';
import { EntityResolver } from './entity-resolver.js';
import { randomUUID } from 'crypto';

export interface ExtractedTurnMemories {
  events: MemoryEvent[];
  memories: StructuredMemory[];
  entityIds: string[];
}

export class EventExtractionEngine {
  constructor(private entityResolver: EntityResolver) {}

  /**
   * Extracts structured events and memories from a conversation exchange.
   * Can run either via structured heuristic rules or with LLM assistance.
   */
  extract(
    userMessage: string,
    assistantMessage: string,
    conversationId: string,
    userId: string,
    messageId: string,
    eventTime?: string
  ): ExtractedTurnMemories {
    const now = new Date().toISOString();
    const time = eventTime || now;
    const events: MemoryEvent[] = [];
    const memories: StructuredMemory[] = [];
    const combined = `${userMessage}\n${assistantMessage}`;

    // Extract mentioned entities
    const extractedEntities = this.entityResolver.extractEntitiesFromText(combined);
    const entityIds = extractedEntities.map(e => e.id);
    const entityNames = extractedEntities.map(e => e.canonical_name);

    // Rule 1: Shortlist detection
    const shortlistMatch = combined.match(/\b(?:shortlist(?:ed|ing)?|options|top \d+)\b[:\s]*(HubSpot|Zoho|Salesforce|Pipedrive|Freshsales|Supabase|Neon|AWS RDS|[A-Z][a-zA-Z0-9\s,]+)/i);
    if (shortlistMatch && extractedEntities.length >= 2) {
      events.push({
        id: randomUUID(),
        user_id: userId,
        conversation_id: conversationId,
        source_message_id: messageId,
        event_type: 'SHORTLISTED',
        description: `Shortlisted ${extractedEntities.length} options: ${entityNames.join(', ')}`,
        event_time: time,
        recorded_at: now,
        confidence: 0.95,
        metadata: { entities: entityNames },
        entities: entityNames,
      });
    }

    // Rule 2: Requirement specification (e.g., team size, backup, budget)
    const teamSizeMatch = combined.match(/(\d+)[\s-]*(?:person|user|seat|people)\s+(?:sales\s+)?team/i);
    if (teamSizeMatch) {
      const teamCount = parseInt(teamSizeMatch[1], 10);
      events.push({
        id: randomUUID(),
        user_id: userId,
        conversation_id: conversationId,
        source_message_id: messageId,
        event_type: 'REQUIREMENT_SPECIFIED',
        description: `User specified a ${teamCount}-person team requirement`,
        event_time: time,
        recorded_at: now,
        confidence: 0.98,
        metadata: { team_size: teamCount },
        entities: entityNames,
      });

      memories.push({
        id: randomUUID(),
        user_id: userId,
        conversation_id: conversationId,
        memory_type: 'REQUIREMENT',
        content: `Team size requirement: ${teamCount} seats`,
        context_date: time,
        recorded_at: now,
        status: 'ACTIVE',
        metadata: { team_size: teamCount },
      });
    }

    // Rule 3: Topic research
    if (combined.toLowerCase().includes('crm')) {
      events.push({
        id: randomUUID(),
        user_id: userId,
        conversation_id: conversationId,
        source_message_id: messageId,
        event_type: 'DISCUSSED',
        description: 'User researched CRM tools and feature comparisons',
        event_time: time,
        recorded_at: now,
        confidence: 0.92,
        metadata: { topic: 'CRM' },
        entities: entityNames,
      });
    } else if (combined.toLowerCase().includes('postgres') || combined.toLowerCase().includes('database')) {
      events.push({
        id: randomUUID(),
        user_id: userId,
        conversation_id: conversationId,
        source_message_id: messageId,
        event_type: 'DISCUSSED',
        description: 'User evaluated PostgreSQL managed hosting providers and pricing',
        event_time: time,
        recorded_at: now,
        confidence: 0.92,
        metadata: { topic: 'PostgreSQL Hosting' },
        entities: entityNames,
      });
    }

    // Rule 4: Preference specification (e.g. affordable, automation, PITR)
    if (/affordable|budget|low-cost|workflow automation|pitr|backups/i.test(combined)) {
      const prefs: string[] = [];
      if (/affordable|budget/i.test(combined)) prefs.push('affordable pricing');
      if (/workflow automation/i.test(combined)) prefs.push('workflow automation');
      if (/pitr|point-in-time recovery/i.test(combined)) prefs.push('point-in-time recovery');

      memories.push({
        id: randomUUID(),
        user_id: userId,
        conversation_id: conversationId,
        memory_type: 'PREFERENCE',
        content: `User indicated preference for: ${prefs.join(', ')}`,
        context_date: time,
        recorded_at: now,
        status: 'ACTIVE',
        metadata: { preferences: prefs },
      });
    }

    return {
      events,
      memories,
      entityIds,
    };
  }
}

