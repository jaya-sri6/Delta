import { describe, it, expect } from 'vitest';
import { validateExternalUrl, WebSearchService } from '../../src/server/services/web-search.js';
import { CitationValidator } from '../../src/server/services/citation-validator.js';
import { Evidence } from '../../src/server/types/index.js';
import { createTestDatabase } from '../../src/server/db/database.js';
import { AgentOrchestrator } from '../../src/server/services/agent-orchestrator.js';
import { seedDemoData } from '../../src/server/db/seed.js';

describe('Web Search & Evidence Pipeline Validation', () => {
  it('rejects fabricated, placeholder, and invalid URLs', () => {
    // Blocked placeholder domains
    expect(validateExternalUrl('https://example.com/pricing').isValid).toBe(false);
    expect(validateExternalUrl('http://example.org/changelog').isValid).toBe(false);
    expect(validateExternalUrl('https://sub.example.com/test').isValid).toBe(false);
    expect(validateExternalUrl('https://test.com/api').isValid).toBe(false);
    expect(validateExternalUrl('http://localhost:3000/doc').isValid).toBe(false);
    expect(validateExternalUrl('http://127.0.0.1/doc').isValid).toBe(false);

    // Malformed URLs
    expect(validateExternalUrl('not-a-url').isValid).toBe(false);
    expect(validateExternalUrl('javascript:alert(1)').isValid).toBe(false);
    expect(validateExternalUrl('ftp://files.com/doc').isValid).toBe(false);
    expect(validateExternalUrl('').isValid).toBe(false);

    // Genuine valid domains
    const hubspot = validateExternalUrl('https://www.hubspot.com/pricing/crm');
    expect(hubspot.isValid).toBe(true);
    expect(hubspot.domain).toBe('hubspot.com');

    const neon = validateExternalUrl('https://neon.tech/pricing');
    expect(neon.isValid).toBe(true);
    expect(neon.domain).toBe('neon.tech');

    const supabase = validateExternalUrl('https://supabase.com/pricing');
    expect(supabase.isValid).toBe(true);
    expect(supabase.domain).toBe('supabase.com');
  });

  it('drops invalid or placeholder URLs from search responses and tracks rejected counts', async () => {
    // Mock fetch that returns a mix of genuine and fabricated URLs
    const mockFetch = async () => {
      return {
        ok: true,
        json: async () => ({
          results: [
            {
              title: 'HubSpot Official Pricing',
              url: 'https://www.hubspot.com/pricing/crm',
              content: 'Sales Hub Pro is $100/seat/month',
              score: 0.95,
            },
            {
              title: 'Fabricated Placeholder Source',
              url: 'https://example.com/fake-pricing',
              content: 'Fake data',
              score: 0.9,
            },
            {
              title: 'Invalid Scheme',
              url: 'ftp://ftp.example.org/file',
              content: 'Invalid',
              score: 0.5,
            },
          ],
        }),
      } as any;
    };

    const searchService = new WebSearchService({
      apiKey: 'test-key',
      fetchFn: mockFetch,
    });

    const res = await searchService.searchDetailed({ query: 'HubSpot pricing' });
    expect(res.status).toBe('SUCCESS');
    expect(res.total_found).toBe(3);
    expect(res.valid_count).toBe(1);
    expect(res.rejected_count).toBe(2);
    expect(res.results[0].url).toBe('https://www.hubspot.com/pricing/crm');
    expect(res.results.some(r => r.url.includes('example.com'))).toBe(false);
  });

  it('honestly reports missing API key without generating fabricated URLs', async () => {
    const searchService = new WebSearchService({ apiKey: undefined });
    const res = await searchService.searchDetailed({ query: 'Freshsales pricing' });

    expect(res.status).toBe('NO_API_KEY');
    expect(res.results.length).toBe(0);
    expect(res.valid_count).toBe(0);
    expect(res.error).toContain('TAVILY_API_KEY');
  });

  it('honestly reports empty search results without inventing sources', async () => {
    const mockEmptyFetch = async () => ({
      ok: true,
      json: async () => ({ results: [] }),
    } as any);

    const searchService = new WebSearchService({
      apiKey: 'test-key',
      fetchFn: mockEmptyFetch,
    });

    const res = await searchService.searchDetailed({ query: 'Obscure query with no results' });
    expect(res.status).toBe('EMPTY');
    expect(res.results.length).toBe(0);
    expect(res.error).toBeDefined();
  });

  it('citation validator strips blacklisted and fabricated URLs', () => {
    const validator = new CitationValidator();
    const storedEvidence: Evidence[] = [
      {
        id: 'ev-1',
        title: 'HubSpot Pricing',
        url: 'https://www.hubspot.com/pricing',
        domain: 'hubspot.com',
        snippet: 'HubSpot pricing details',
        retrieved_at: new Date().toISOString(),
        evidence_type: 'OFFICIAL_PRICING',
        credibility_category: 'PRIMARY_OFFICIAL',
      },
      {
        id: 'ev-2',
        title: 'Invalid Fake Evidence',
        url: 'https://example.com/fake',
        domain: 'example.com',
        snippet: 'Fake',
        retrieved_at: new Date().toISOString(),
        evidence_type: 'UNKNOWN',
        credibility_category: 'UNVERIFIED',
      },
    ];

    const text = 'Here is the [Official Link](https://www.hubspot.com/pricing) and a [Fake Link](https://example.com/fake).';
    const { validatedText, report } = validator.validate(text, storedEvidence);

    expect(report.rejectedUrls).toContain('https://example.com/fake');
    expect(validatedText).not.toContain('https://example.com/fake');
    expect(report.validCitations.some(c => c.url.includes('example.com'))).toBe(false);
    expect(report.validCitations.some(c => c.url === 'https://www.hubspot.com/pricing')).toBe(true);
  });

  it('orchestrator search metrics accurately distinguish planned, executed, and researched entities', async () => {
    const db = createTestDatabase();
    seedDemoData(db, 'test_user');

    // Mock search that returns genuine results for HubSpot and Neon, but empty for others
    const mockFetch = async (url: string, init?: any) => {
      const body = JSON.parse(init?.body || '{}');
      const query = (body.query || '').toLowerCase();

      if (query.includes('hubspot')) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                title: 'HubSpot Sales Hub Pricing 2026',
                url: 'https://www.hubspot.com/pricing/crm',
                content: 'HubSpot Sales Hub Professional starts at $100/seat/month.',
                score: 0.98,
              },
            ],
          }),
        } as any;
      }

      return {
        ok: true,
        json: async () => ({ results: [] }),
      } as any;
    };

    const mockSearchService = new WebSearchService({
      apiKey: 'test-key',
      fetchFn: mockFetch,
    });

    const orchestrator = new AgentOrchestrator(
      db,
      undefined,
      'gpt-4o',
      'test-key',
      'Asia/Kolkata',
      mockSearchService
    );

    const result = await orchestrator.process({
      userId: 'test_user',
      conversationId: 'demo-conv-crm-monday',
      userMessage: 'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?',
    });

    const summary = result.activity_summary;

    // Must have planned queries for all 5 entities
    expect(summary.planned_queries_count).toBe(5);
    expect(summary.executed_queries_count).toBe(5);

    // Only 1 query (HubSpot) returned valid results
    expect(summary.successful_queries_count).toBe(1);
    expect(summary.researched_entities).toContain('HubSpot');
    expect(summary.unresearched_entities).toContain('Zoho CRM');
    expect(summary.unresearched_entities).toContain('Salesforce');
    expect(summary.unresearched_entities).toContain('Pipedrive');
    expect(summary.unresearched_entities).toContain('Freshsales');

    // Only HubSpot should have a valid citation
    expect(result.citations.length).toBe(1);
    expect(result.citations[0].url).toBe('https://www.hubspot.com/pricing/crm');
    expect(result.citations[0].domain).toBe('hubspot.com');

    // Must not count zero-evidence entities as verified
    expect(summary.unverified_count).toBeGreaterThan(0);
  });

  it('relevance-scoped retrieval strictly excludes CRM entities when researching PostgreSQL hosting', async () => {
    const db = createTestDatabase();
    seedDemoData(db, 'scoped_test_user');

    const orchestrator = new AgentOrchestrator(
      db,
      undefined,
      'gpt-4o',
      undefined,
      'Asia/Kolkata'
    );

    const result = await orchestrator.process({
      userId: 'scoped_test_user',
      conversationId: 'demo-conv-postgres-last-tuesday',
      userMessage: 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?',
    });

    const summary = result.activity_summary;

    // Relevant entities must contain PostgreSQL hosting providers
    expect(summary.relevant_entities).toContain('Neon');
    expect(summary.relevant_entities).toContain('Supabase');
    expect(summary.relevant_entities).toContain('AWS RDS');

    // Strict domain scoping: CRM entities must be 100% excluded!
    expect(summary.relevant_entities).not.toContain('HubSpot');
    expect(summary.relevant_entities).not.toContain('Zoho CRM');
    expect(summary.relevant_entities).not.toContain('Salesforce');
    expect(summary.relevant_entities).not.toContain('Pipedrive');
    expect(summary.relevant_entities).not.toContain('Freshsales');

    // Total relevant entities should only be the 3 providers (plus canonical PostgreSQL if directly extracted)
    expect(summary.relevant_entities.length).toBeLessThanOrEqual(4);
  });

  it('retries transient 500 errors with backoff and recovers successfully', async () => {
    let callCount = 0;
    const mockTransientFetch = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          text: async () => 'Temporary overload',
        } as any;
      }
      return {
        ok: true,
        json: async () => ({
          results: [
            {
              title: 'Neon Official Pricing',
              url: 'https://neon.tech/pricing',
              content: 'Neon launch plan is $19',
              score: 0.99,
            },
          ],
        }),
      } as any;
    };

    const searchService = new WebSearchService({
      apiKey: 'test-key',
      fetchFn: mockTransientFetch,
    });

    const res = await searchService.searchDetailed({ query: 'Neon pricing' });
    expect(callCount).toBe(2); // Retried once and succeeded!
    expect(res.status).toBe('SUCCESS');
    expect(res.results.length).toBe(1);
    expect(res.results[0].domain).toBe('neon.tech');
  });

  it('safely handles user cancellation via AbortSignal without premature termination', async () => {
    const mockHangingFetch = async (_url: any, init?: any) => {
      return new Promise((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const abortError = new Error('The operation was aborted');
          abortError.name = 'AbortError';
          reject(abortError);
        });
      });
    };

    const searchService = new WebSearchService({
      apiKey: 'test-key',
      fetchFn: mockHangingFetch,
    });

    const clientController = new AbortController();
    const searchPromise = searchService.searchDetailed(
      { query: 'Long running search' },
      clientController.signal
    );

    // Cancel after 20ms
    setTimeout(() => clientController.abort(), 20);

    const result = await searchPromise;
    expect(result.status).toBe('FAILED');
    expect(result.error).toBe('Search request cancelled by user');
    expect(result.valid_count).toBe(0);
  });

  it('handles query timeout cleanly when provider is unresponsive', async () => {
    const mockHangingFetch = async (_url: any, init?: any) => {
      return new Promise((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const abortError = new Error('The operation was aborted');
          abortError.name = 'AbortError';
          reject(abortError);
        });
      });
    };

    const searchService = new WebSearchService({
      apiKey: 'test-key',
      timeoutMs: 50, // Fast timeout for test
      fetchFn: mockHangingFetch,
    });

    const result = await searchService.searchDetailed({ query: 'Hanging query' });
    expect(result.status).toBe('FAILED');
    expect(result.error).toContain('timed out');
  });

  it('reports Tavily API auth failure clearly without retrying 401/403', async () => {
    let callCount = 0;
    const mockAuthFailFetch = async () => {
      callCount++;
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid API key provided',
      } as any;
    };

    const searchService = new WebSearchService({
      apiKey: 'invalid-key',
      fetchFn: mockAuthFailFetch,
    });

    const result = await searchService.searchDetailed({ query: 'Auth test' });
    expect(callCount).toBe(1); // Must NOT retry auth failure
    expect(result.status).toBe('FAILED');
    expect(result.error).toContain('Tavily API authentication failed');
  });
});

