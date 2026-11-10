import { ResearchPlan, IntentType, SearchQueryPlan, TemporalResolution } from '../types/index.js';
import { RetrievedContext } from './memory-retrieval.js';
import { ClassificationResult } from './intent-classifier.js';

export class ResearchPlanner {
  constructor(private defaultSearchBudget: number = 5) {}

  /**
   * Constructs a typed, validated research plan tailored to the user's intent and historical context
   */
  createPlan(
    userMessage: string,
    classification: ClassificationResult,
    temporal: TemporalResolution,
    context: RetrievedContext
  ): ResearchPlan {
    const { intent } = classification;
    const targetEntities: string[] = [];

    // 1. Collect entities already retrieved from historical context
    context.entities.forEach(e => {
      if (!targetEntities.includes(e.canonical_name)) {
        targetEntities.push(e.canonical_name);
      }
    });

    // 2. Check if context events listed entities that aren't yet in targetEntities
    for (const ev of context.events) {
      if (ev.entities) {
        ev.entities.forEach(entName => {
          if (!targetEntities.includes(entName)) {
            targetEntities.push(entName);
          }
        });
      }
    }

    // 3. Check if user explicitly mentioned known entities in this message
    const lower = userMessage.toLowerCase();
    const commonEntities = ['HubSpot', 'Zoho CRM', 'Salesforce', 'Pipedrive', 'Freshsales', 'Neon', 'Supabase', 'AWS RDS'];
    for (const ent of commonEntities) {
      if (lower.includes(ent.toLowerCase()) && !targetEntities.includes(ent)) {
        targetEntities.push(ent);
      }
    }

    let search_required = false;
    const search_queries: SearchQueryPlan[] = [];
    const claims_to_verify: string[] = [];
    const expected_evidence: string[] = [];

    switch (intent) {
      case 'GENERAL_CHAT':
        search_required = false;
        break;

      case 'HISTORICAL_RECALL':
        search_required = false;
        break;

      case 'CHANGE_DETECTION':
        search_required = true;
        // Construct focused, official queries for each target entity
        if (targetEntities.length > 0) {
          for (const ent of targetEntities.slice(0, this.defaultSearchBudget)) {
            search_queries.push({
              query: `${ent} official pricing updates changelog 2026`,
              target_entity: ent,
              topic: 'general',
              search_depth: 'basic',
            });
          }
          expected_evidence.push('OFFICIAL_PRICING', 'OFFICIAL_RELEASE_NOTES');
        } else {
          search_queries.push({
            query: `${userMessage} official pricing updates`,
            topic: 'general',
            search_depth: 'basic',
          });
        }
        break;

      case 'ANSWER_VERIFICATION':
        search_required = true;
        context.claims.forEach(c => claims_to_verify.push(`${c.predicate}: ${c.current_value}`));
        if (targetEntities.length > 0) {
          for (const ent of targetEntities.slice(0, this.defaultSearchBudget)) {
            search_queries.push({
              query: `${ent} official pricing specifications current 2026`,
              target_entity: ent,
              topic: 'general',
              search_depth: 'basic',
            });
          }
        } else {
          search_queries.push({
            query: `${userMessage} verification evidence`,
            topic: 'general',
            search_depth: 'basic',
          });
        }
        expected_evidence.push('OFFICIAL_PRICING', 'OFFICIAL_DOCUMENTATION');
        break;

      case 'CURRENT_RESEARCH':
        search_required = true;
        search_queries.push({
          query: userMessage,
          topic: 'general',
          search_depth: 'basic',
        });
        expected_evidence.push('OFFICIAL_DOCUMENTATION', 'OFFICIAL_PRICING');
        break;

      case 'FOLLOW_UP':
        if (classification.hasComparisonCue || classification.hasVerificationCue) {
          search_required = true;
          search_queries.push({
            query: `${userMessage} updates`,
            topic: 'general',
            search_depth: 'basic',
          });
        } else {
          search_required = false;
        }
        break;

      case 'AMBIGUOUS':
        search_required = false;
        break;
    }

    return {
      intent,
      target_entities: targetEntities,
      historical_context_required: ['HISTORICAL_RECALL', 'CHANGE_DETECTION', 'ANSWER_VERIFICATION', 'FOLLOW_UP'].includes(intent),
      date_range: temporal.resolved_start ? {
        start: temporal.resolved_start,
        end: temporal.resolved_end || undefined,
        description: temporal.original_expression,
      } : null,
      claims_to_verify,
      search_required,
      search_queries,
      expected_evidence,
      maximum_search_calls: Math.min(search_queries.length, this.defaultSearchBudget),
    };
  }
}
