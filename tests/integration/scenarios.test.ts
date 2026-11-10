import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDatabase, DeltaDatabase } from '../../src/server/db/database.js';
import { buildApp } from '../../src/server/app.js';
import { seedDemoData } from '../../src/server/db/seed.js';
import { WebSearchService } from '../../src/server/services/web-search.js';
import { FastifyInstance } from 'fastify';

describe('DELTA Benchmark Scenarios & System Integration', () => {
  let db: DeltaDatabase;
  let app: FastifyInstance;
  let seededIds: { conversationAId: string; conversationBId: string; conversationCId: string };

  beforeAll(async () => {
    db = createTestDatabase();
    seededIds = seedDemoData(db, 'test_user');

    // Tavily API fixture provider returning genuine, verified domains and URLs
    const mockTavilyFetch = async (url: string, init?: any) => {
      const body = JSON.parse(init?.body || '{}');
      const q = (body.query || '').toLowerCase();

      let results: any[] = [];

      if (q.includes('hubspot')) {
        results = [
          {
            title: 'HubSpot CRM Official Pricing & Plans 2026',
            url: 'https://www.hubspot.com/pricing/crm',
            content: 'HubSpot Sales Hub Professional starts at $100/seat/month billed annually. Breeze AI Copilot shipped.',
            score: 0.98,
          },
        ];
      } else if (q.includes('zoho')) {
        results = [
          {
            title: 'Zoho CRM Official Pricing Plans',
            url: 'https://www.zoho.com/crm/pricing.html',
            content: 'Zoho CRM Professional remains at $23/user/month billed annually. Standard is $14.',
            score: 0.95,
          },
        ];
      } else if (q.includes('salesforce')) {
        results = [
          {
            title: 'Salesforce Sales Cloud Pricing',
            url: 'https://www.salesforce.com/editions-pricing/sales-cloud/',
            content: 'Salesforce Enterprise edition is $165/user/month billed annually.',
            score: 0.94,
          },
        ];
      } else if (q.includes('pipedrive')) {
        results = [
          {
            title: 'Pipedrive CRM Pricing Plans',
            url: 'https://www.pipedrive.com/en/pricing',
            content: 'Pipedrive Advanced plan is $29/user/month billed annually.',
            score: 0.92,
          },
        ];
      } else if (q.includes('freshsales')) {
        results = [
          {
            title: 'Freshsales Official Pricing - Freshworks',
            url: 'https://www.freshworks.com/crm/sales/pricing/',
            content: 'Freshsales Pro plan is $39/user/month billed annually.',
            score: 0.91,
          },
        ];
      } else if (q.includes('neon')) {
        results = [
          {
            title: 'Neon Serverless Postgres Pricing',
            url: 'https://neon.tech/pricing',
            content: 'Neon Launch plan is $19/month with 10 GB storage and 300 compute hours.',
            score: 0.98,
          },
        ];
      } else if (q.includes('supabase')) {
        results = [
          {
            title: 'Supabase Database Pricing',
            url: 'https://supabase.com/pricing',
            content: 'Supabase Pro plan is $25/month including 8GB storage and 7-day PITR.',
            score: 0.97,
          },
        ];
      } else if (q.includes('aws') || q.includes('rds')) {
        results = [
          {
            title: 'Amazon RDS for PostgreSQL Pricing',
            url: 'https://aws.amazon.com/rds/postgresql/pricing/',
            content: 'db.t4g.micro single-AZ is ~$0.016/hour (~$11.68/month).',
            score: 0.95,
          },
        ];
      }

      return {
        ok: true,
        json: async () => ({ results }),
      } as any;
    };

    const mockSearchService = new WebSearchService({
      apiKey: 'test-tavily-key',
      fetchFn: mockTavilyFetch,
    });

    app = await buildApp(db, mockSearchService);
  });

  it('verifies health check endpoint returns healthy system status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('healthy');
    expect(body.product).toBe('DELTA');
    expect(body.features.event_memory).toBe(true);
  });

  it('lists seeded historical conversations with explicit demo flags', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/conversations?user_id=test_user',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.conversations.length).toBeGreaterThanOrEqual(3);
    const crmConv = body.conversations.find((c: any) => c.id === seededIds.conversationAId);
    expect(crmConv).toBeDefined();
    expect(crmConv.is_demo).toBe(1);
    expect(crmConv.title).toContain('[DEMO DATA]');
  });

  it('SCENARIO A: Evaluates CRM shortlist for 20-person team and executes searches across all 5 entities', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        user_id: 'test_user',
        conversation_id: seededIds.conversationAId,
        message: 'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.message.content).toBeDefined();

    // Verify search metrics: 5 planned queries and 5 executed queries
    const summary = body.activity_summary;
    expect(summary.planned_queries_count).toBe(5);
    expect(summary.executed_queries_count).toBe(5);
    expect(summary.successful_queries_count).toBe(5);
    expect(summary.relevant_entities.length).toBe(5);
    expect(summary.researched_entities.length).toBe(5);

    // Verify all 5 entities are present in content
    const content = body.message.content;
    expect(content).toContain('HubSpot');
    expect(content).toContain('Zoho CRM');
    expect(content).toContain('Salesforce');
    expect(content).toContain('Pipedrive');
    expect(content).toContain('Freshsales');

    // Verify Breeze AI product update captured
    expect(content.toLowerCase()).toMatch(/breeze|ai|shipped|copilot/);

    // Verify citations: all must have genuine domains, zero example.com
    expect(body.citations.length).toBeGreaterThanOrEqual(4);
    for (const citation of body.citations) {
      expect(citation.url).not.toContain('example.com');
      expect(citation.domain).not.toBe('example.com');
    }
  });

  it('SCENARIO B: Validates 3 November question and evaluates claim-level correctness today', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        user_id: 'test_user',
        conversation_id: seededIds.conversationBId,
        message: 'What did I ask you on 3 November? Is your answer still correct today?',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const content = body.message.content;

    // Original question retrieved
    expect(content).toContain('3 November');
    expect(content).toMatch(/PostgreSQL|hosting|backups|point-in-time recovery/i);

    // Claim-by-claim verification report
    expect(content).toContain('Neon');
    expect(content).toContain('Supabase');
    expect(content).toContain('AWS RDS');
    expect(content).toMatch(/VERIFIED|correct/i);

    // Verify citations are authentic
    expect(body.citations.length).toBeGreaterThan(0);
    for (const citation of body.citations) {
      expect(citation.url).not.toContain('example.com');
      expect(citation.domain).not.toBe('example.com');
    }
  });

  it('SCENARIO C: Detects PostgreSQL hosting pricing changes since last Tuesday with strict scope', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        user_id: 'test_user',
        conversation_id: seededIds.conversationCId,
        message: 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const content = body.message.content;
    const summary = body.activity_summary;

    // Verify relevant entities scope: strictly Postgres hosting providers, NO CRM entities!
    expect(summary.relevant_entities).toContain('Neon');
    expect(summary.relevant_entities).toContain('Supabase');
    expect(summary.relevant_entities).toContain('AWS RDS');
    expect(summary.relevant_entities).not.toContain('HubSpot');
    expect(summary.relevant_entities).not.toContain('Zoho CRM');
    expect(summary.relevant_entities).not.toContain('Salesforce');
    expect(summary.relevant_entities).not.toContain('Pipedrive');
    expect(summary.relevant_entities).not.toContain('Freshsales');

    // Executed queries must match relevant entities
    expect(summary.planned_queries_count).toBeLessThanOrEqual(4);
    expect(summary.executed_queries_count).toBeLessThanOrEqual(4);

    expect(content).toMatch(/last Tuesday|Tuesday/i);
    expect(content).toContain('Neon');
    expect(content).toContain('Supabase');
    expect(content).toContain('AWS RDS');
    expect(content).toMatch(/unchanged|stable|\$19|\$25/i);

    // Verify citations
    for (const citation of body.citations) {
      expect(citation.url).not.toContain('example.com');
      expect(citation.domain).not.toBe('example.com');
    }
  });

  it('supports full-text search across conversations and messages', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/conversations?q=Postgres&user_id=test_user',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.conversations.length).toBeGreaterThan(0);
  });

  it('provides independent search health diagnostic endpoint /api/health/search', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health/search?q=PostgreSQL',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.provider).toBe('tavily');
    expect(body.query).toBe('PostgreSQL');
    expect(typeof body.duration_ms).toBe('number');
    expect(['SUCCESS', 'EMPTY', 'FAILED', 'NO_API_KEY']).toContain(body.status);
    expect(body).not.toHaveProperty('api_key');
  });

  it('SCENARIO E: A new conversation retrieves CRM fixture and PostgreSQL fixture independently in the same request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        user_id: 'test_user',
        message: 'What did we decide about CRM pricing? Also, what did we research about PostgreSQL hosting?',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const content = body.message.content;
    const summary = body.activity_summary;

    expect(content).toContain('CRM');
    expect(content).toContain('PostgreSQL');
    expect(content).toContain('HubSpot');
    expect(content).toContain('Zoho CRM');
    expect(content).toContain('Salesforce');
    expect(content).toContain('Pipedrive');
    expect(content).toContain('Freshsales');
    expect(content).not.toContain('No historical memory or previous discussion records were found for this topic');
    expect(content).toContain('Neon');
    expect(content).toContain('Supabase');
    expect(content).toContain('AWS RDS');

    expect(summary.topics).toBeDefined();
    expect(summary.topics!.length).toBe(2);
  });
});
