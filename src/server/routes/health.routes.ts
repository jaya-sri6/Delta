import { FastifyInstance } from 'fastify';
import { DeltaDatabase } from '../db/database.js';
import { WebSearchService } from '../services/web-search.js';
import { config } from '../config.js';

export async function healthRoutes(app: FastifyInstance, opts: { db: DeltaDatabase; webSearchService?: WebSearchService }) {
  const searchService = opts.webSearchService || new WebSearchService({ apiKey: config.tavilyApiKey });

  app.get('/api/health', async (request, reply) => {
    try {
      // Quick query to test DB liveness
      opts.db.prepare('SELECT 1').get();

      return reply.send({
        status: 'healthy',
        product: 'DELTA',
        tagline: 'An AI that knows what changed.',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        timezone: config.userTimezone,
        api_keys_configured: {
          tavily: Boolean(config.tavilyApiKey && config.tavilyApiKey.trim().length > 0),
          openai: Boolean(config.openaiApiKey && config.openaiApiKey.trim().length > 0),
        },
        features: {
          event_memory: true,
          claim_knowledge: true,
          temporal_intelligence: true,
          citation_validation: true,
          web_search: true,
        },
      });
    } catch (err: any) {
      return reply.status(500).send({
        status: 'unhealthy',
        error: err.message,
      });
    }
  });

  /**
   * Diagnostic endpoint to test live Tavily connectivity in isolation without chat side effects.
   * Safe to call; never logs or exposes API keys.
   */
  app.get('/api/health/search', async (request, reply) => {
    const isConfigured = Boolean(config.tavilyApiKey && config.tavilyApiKey.trim().length > 0);
    const query = (request.query as any)?.q || 'PostgreSQL';

    if (!isConfigured) {
      return reply.send({
        status: 'NO_API_KEY',
        configured: false,
        provider: 'tavily',
        query,
        message: 'TAVILY_API_KEY is not configured in .env. Live web searches are operating in historical baseline mode.',
        total_found: 0,
        valid_count: 0,
        duration_ms: 0,
      });
    }

    try {
      const res = await searchService.searchDetailed({
        query,
        topic: 'general',
        search_depth: 'basic',
      });

      return reply.send({
        status: res.status,
        configured: true,
        provider: 'tavily',
        query: res.query,
        total_found: res.total_found,
        valid_count: res.valid_count,
        rejected_count: res.rejected_count,
        duration_ms: res.duration_ms,
        sample_sources: res.results.slice(0, 2).map(r => ({
          title: r.title,
          url: r.url,
          domain: r.domain,
          score: r.score,
        })),
        error: res.error || null,
      });
    } catch (err: any) {
      return reply.status(500).send({
        status: 'FAILED',
        configured: true,
        provider: 'tavily',
        query,
        error: err.message || 'Diagnostic search execution failed',
      });
    }
  });
}

