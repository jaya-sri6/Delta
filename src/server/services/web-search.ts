import { z } from 'zod';
import { EvidenceType, CredibilityCategory } from '../types/index.js';

export const WebSearchInputSchema = z.object({
  query: z.string().min(1, 'Query must not be empty'),
  target_entity: z.string().optional(),
  topic: z.enum(['general', 'news']).default('general'),
  search_depth: z.enum(['basic', 'advanced']).default('basic'),
  time_range: z.string().optional(),
});

export type WebSearchInput = z.infer<typeof WebSearchInputSchema>;

export interface NormalizedSearchResult {
  title: string;
  url: string;
  snippet: string;
  published_at?: string;
  retrieved_at: string;
  domain: string;
  score: number;
  evidence_type: EvidenceType;
  credibility_category: CredibilityCategory;
}

export interface RejectedSourceInfo {
  url: string;
  domain: string;
  title?: string;
  reason: string;
}

export interface SearchExecutionResult {
  query: string;
  target_entity?: string;
  status: 'SUCCESS' | 'EMPTY' | 'FAILED' | 'NO_API_KEY';
  results: NormalizedSearchResult[];
  rejected_sources?: RejectedSourceInfo[];
  total_found: number;
  valid_count: number;
  rejected_count: number;
  duration_ms: number;
  error?: string;
}

export interface WebSearchToolConfig {
  apiKey?: string;
  cacheTtlMs?: number; // default 10 minutes
  timeoutMs?: number; // default 15000ms
  fetchFn?: (input: any, init?: any) => Promise<any>; // Injectable fetch for deterministic testing
}

export const BLOCKED_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'example.edu',
  'test.com',
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'placeholder.com',
  'invalid.com',
  'sample.com',
]);

export const VENDOR_OFFICIAL_DOMAINS: Record<string, string[]> = {
  'hubspot': ['hubspot.com'],
  'zoho': ['zoho.com'],
  'zoho crm': ['zoho.com'],
  'salesforce': ['salesforce.com'],
  'salesforce sales cloud': ['salesforce.com'],
  'pipedrive': ['pipedrive.com'],
  'freshsales': ['freshworks.com'],
  'freshworks': ['freshworks.com'],
  'neon': ['neon.tech', 'neon.com'],
  'neon serverless': ['neon.tech', 'neon.com'],
  'supabase': ['supabase.com'],
  'aws': ['aws.amazon.com'],
  'aws rds': ['aws.amazon.com'],
  'postgresql': ['postgresql.org'],
};

// Explicit third-party review, comparison, or integration platforms that must NEVER be classified as official vendor
export const KNOWN_THIRD_PARTY_DOMAINS = new Set([
  'method.me',
  'onepagecrm.com',
  'emailtooltester.com',
  'jetadmin.io',
  'activepieces.com',
  'metacto.com',
  'g2.com',
  'capterra.com',
  'trustradius.com',
  'softwareadvice.com',
  'tavily.com',
  'medium.com',
  'reddit.com',
  'wikipedia.org',
]);

// Known third-party platforms that pollute search results for CRM queries
export const UNRELATED_PLATFORM_KEYWORDS = [
  'shopify',
  'woocommerce',
  'bigcommerce',
  'magento',
  'squarespace',
  'wix',
  'prestashop',
];

export interface UrlValidationResult {
  isValid: boolean;
  domain?: string;
  reason?: string;
}

/**
 * Validates that a URL is a well-formed external HTTP/HTTPS URL and not a placeholder or fake domain.
 */
export function validateExternalUrl(urlString: string): UrlValidationResult {
  if (!urlString || typeof urlString !== 'string') {
    return { isValid: false, reason: 'URL string is empty or invalid' };
  }

  try {
    const parsed = new URL(urlString.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { isValid: false, reason: `Invalid protocol '${parsed.protocol}': only http and https are allowed` };
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (!hostname || hostname.includes(' ') || !hostname.includes('.')) {
      return { isValid: false, reason: `Invalid hostname format: '${hostname}'` };
    }

    if (
      BLOCKED_DOMAINS.has(hostname) ||
      hostname.endsWith('.example.com') ||
      hostname.endsWith('.example.org') ||
      hostname.endsWith('.local')
    ) {
      return { isValid: false, reason: `Blocked or placeholder domain '${hostname}'` };
    }

    const parts = hostname.split('.');
    const tld = parts[parts.length - 1];
    if (!/^[a-z]{2,}$/i.test(tld)) {
      return { isValid: false, reason: `Invalid top-level domain '${tld}'` };
    }

    return { isValid: true, domain: hostname };
  } catch (err: any) {
    return { isValid: false, reason: `URL parsing exception: ${err.message}` };
  }
}

export interface SourceRelevanceEvaluation {
  isAccepted: boolean;
  rejectionReason?: string;
  domain: string;
  isOfficialVendor: boolean;
  evidenceType: EvidenceType;
  credibility: CredibilityCategory;
}

/**
 * Evaluates whether a raw search result is relevant to the target entity and query topic.
 * Excludes unrelated platforms (e.g. Shopify updates), non-entity mentions, and low-quality portals.
 */
export function evaluateSourceRelevance(
  rawResult: { url: string; title?: string; content?: string },
  targetEntity?: string
): SourceRelevanceEvaluation {
  const urlCheck = validateExternalUrl(rawResult.url);
  if (!urlCheck.isValid || !urlCheck.domain) {
    return {
      isAccepted: false,
      rejectionReason: urlCheck.reason || 'Invalid external URL',
      domain: urlCheck.domain || 'unknown',
      isOfficialVendor: false,
      evidenceType: 'UNKNOWN',
      credibility: 'UNVERIFIED',
    };
  }

  const domain = urlCheck.domain.toLowerCase();
  const title = (rawResult.title || '').toLowerCase();
  const snippet = (rawResult.content || '').toLowerCase();
  const fullText = `${domain} ${title} ${snippet}`;

  // 1. Target Entity Relevance Check
  if (targetEntity) {
    const entityClean = targetEntity.toLowerCase().trim();

    // 1a. Generic PostgreSQL release notes or docs cannot verify managed cloud hosting costs
    if (['neon', 'neon serverless', 'supabase', 'aws rds', 'aws'].includes(entityClean)) {
      if (
        domain === 'postgresql.org' ||
        domain.endsWith('.postgresql.org') ||
        (title.includes('postgresql') && (title.includes('released') || title.includes('release notes') || title.includes('documentation') || title.includes('manual')))
      ) {
        if (!fullText.includes(entityClean) && !fullText.includes('neon') && !fullText.includes('supabase') && !fullText.includes('rds')) {
          return {
            isAccepted: false,
            rejectionReason: `Generic PostgreSQL documentation/release notes cannot verify managed cloud hosting costs or provider-specific pricing for "${targetEntity}"`,
            domain,
            isOfficialVendor: false,
            evidenceType: 'UNKNOWN',
            credibility: 'UNVERIFIED',
          };
        }
      }

      // 1b. Unrelated cloud provider (Azure / GCP) cannot verify AWS RDS / Neon / Supabase
      if (
        /\b(google\s+cloud|gcp|azure\s+cloud|azure\s+sql|azure\s+postgresql|azure\s+database)\b/i.test(title) ||
        domain.includes('azure.com') ||
        domain.includes('microsoft.com')
      ) {
        if (!domain.includes('aws.amazon.com') && !domain.includes('supabase.com') && !domain.includes('neon')) {
          return {
            isAccepted: false,
            rejectionReason: `Unrelated cloud provider: Azure/GCP release notes cannot verify ${targetEntity} prices`,
            domain,
            isOfficialVendor: false,
            evidenceType: 'UNKNOWN',
            credibility: 'UNVERIFIED',
          };
        }
      }
    }

    // Match entity tokens (e.g. "hubspot", "zoho", "salesforce", "pipedrive", "freshsales", "neon", "supabase", "aws")
    const entityTokens = entityClean.split(/\s+/).filter(t => t.length > 2);
    const mentionsEntity = entityTokens.some(token => fullText.includes(token));

    if (!mentionsEntity) {
      return {
        isAccepted: false,
        rejectionReason: `Unrelated source: missing mention of target entity "${targetEntity}"`,
        domain,
        isOfficialVendor: false,
        evidenceType: 'UNKNOWN',
        credibility: 'UNVERIFIED',
      };
    }

    // 2. Unrelated Platform Polluters Check (e.g. Shopify updates appearing when searching CRM)
    const isTargetingPlatform = UNRELATED_PLATFORM_KEYWORDS.some(k => entityClean.includes(k));
    if (!isTargetingPlatform) {
      for (const platform of UNRELATED_PLATFORM_KEYWORDS) {
        const platformInTitle = title.includes(platform);
        const platformDomain = domain.includes(platform);
        // If the article is primarily about Shopify/WooCommerce and not the target entity's core release
        if (platformDomain || (platformInTitle && !title.includes(entityClean))) {
          return {
            isAccepted: false,
            rejectionReason: `Unrelated platform: source is focused on ${platform} updates rather than target vendor "${targetEntity}"`,
            domain,
            isOfficialVendor: false,
            evidenceType: 'UNKNOWN',
            credibility: 'UNVERIFIED',
          };
        }
      }
    }

    // 2b. Neon Database Hosting specific disambiguation (signs/lighting vs Neon CRM vs Neon serverless postgres)
    if (entityClean === 'neon' || entityClean === 'neon serverless') {
      if (domain.includes('neoncrm.com') || domain.includes('neonone.com') || /\b(neon\s+crm|neoncrm|neon\s+one|donor\s+management|fundraising)\b/i.test(fullText)) {
        return {
          isAccepted: false,
          rejectionReason: 'Unrelated entity: Neon CRM (nonprofit donor/fundraising software) rather than Neon PostgreSQL database hosting',
          domain,
          isOfficialVendor: false,
          evidenceType: 'UNKNOWN',
          credibility: 'UNVERIFIED',
        };
      }
      if (/\b(neon\s+signs?|neon\s+lights?|custom\s+neon|neon\s+decor|glass\s+neon|led\s+neon|lighting)\b/i.test(fullText)) {
        return {
          isAccepted: false,
          rejectionReason: 'Unrelated entity: Neon sign/lighting decor article rather than Neon serverless database',
          domain,
          isOfficialVendor: false,
          evidenceType: 'UNKNOWN',
          credibility: 'UNVERIFIED',
        };
      }
    }

    // 2c. Unrelated cloud platform polluters for Database Hosting
    if (entityClean === 'aws rds' || entityClean === 'aws' || entityClean === 'supabase' || entityClean === 'neon' || entityClean === 'neon serverless') {
      if (
        /\b(google\s+cloud|gcp|azure\s+cloud|azure\s+sql|azure\s+postgresql|azure\s+database)\b/i.test(title) ||
        domain.includes('azure.com') ||
        domain.includes('microsoft.com')
      ) {
        if (!domain.includes('aws.amazon.com') && !domain.includes('supabase.com') && !domain.includes('neon')) {
          return {
            isAccepted: false,
            rejectionReason: `Unrelated cloud provider: Azure/GCP release notes cannot verify ${targetEntity} prices`,
            domain,
            isOfficialVendor: false,
            evidenceType: 'UNKNOWN',
            credibility: 'UNVERIFIED',
          };
        }
      }

      if (domain === 'postgresql.org' || domain.endsWith('.postgresql.org') || (title.includes('postgresql') && (title.includes('released') || title.includes('release notes') || title.includes('documentation') || title.includes('manual')))) {
        if (!fullText.includes('neon') && !fullText.includes('supabase') && !fullText.includes('rds') && !fullText.includes('aws')) {
          return {
            isAccepted: false,
            rejectionReason: `Generic PostgreSQL documentation/release notes cannot verify managed cloud hosting costs or provider-specific pricing for "${targetEntity}"`,
            domain,
            isOfficialVendor: false,
            evidenceType: 'UNKNOWN',
            credibility: 'UNVERIFIED',
          };
        }
      }

      if (entityClean === 'supabase' && (title.includes('changelog') || rawResult.url.includes('/changelog'))) {
        if (!fullText.includes('$') && !fullText.includes('pricing') && !fullText.includes('/mo') && !fullText.includes('plan')) {
          return {
            isAccepted: false,
            rejectionReason: `Supabase developer changelogs without plan rate specifics cannot independently verify Supabase plan pricing`,
            domain,
            isOfficialVendor: false,
            evidenceType: 'UNKNOWN',
            credibility: 'UNVERIFIED',
          };
        }
      }
    }
  }

  // 3. Irrelevant Content Type Check (generic login pages, generic terms of service, cookie banners)
  if (
    title.includes('login') ||
    title.includes('sign in') ||
    title.includes('cookie policy') ||
    title.includes('terms of service') ||
    title.includes('privacy policy')
  ) {
    if (!fullText.includes('pricing') && !fullText.includes('changelog') && !fullText.includes('release')) {
      return {
        isAccepted: false,
        rejectionReason: 'Irrelevant page type (portal login or legal policy page without pricing/release details)',
        domain,
        isOfficialVendor: false,
        evidenceType: 'UNKNOWN',
        credibility: 'UNVERIFIED',
      };
    }
  }

  // 4. Official Vendor vs Third Party Categorization
  // Strict rule: Source is ONLY official vendor if domain matches the registered vendor domain or approved subdomain.
  // Never classify a source as official merely because its title or content mentions the vendor.
  // Never classify Method, OnePageCRM, EmailToolTester, JetAdmin, Activepieces, MetaCTO, etc. as official.
  let isOfficialVendor = false;
  if (targetEntity) {
    const entityKey = targetEntity.toLowerCase().trim();
    const officialDomains = VENDOR_OFFICIAL_DOMAINS[entityKey] || [];
    if (!KNOWN_THIRD_PARTY_DOMAINS.has(domain)) {
      if (officialDomains.some(d => domain === d || domain.endsWith('.' + d))) {
        isOfficialVendor = true;
      }
    }
  }

  let evidenceType: EvidenceType = 'THIRD_PARTY_RESEARCH';
  let credibility: CredibilityCategory = isOfficialVendor ? 'PRIMARY_OFFICIAL' : 'SECONDARY_RELIABLE';

  if (isOfficialVendor) {
    if (fullText.includes('pricing') || fullText.includes('/pricing') || fullText.includes('plans') || fullText.includes('cost')) {
      evidenceType = 'OFFICIAL_PRICING';
    } else if (fullText.includes('changelog') || fullText.includes('release notes') || fullText.includes('whats new') || fullText.includes('/releases')) {
      evidenceType = 'OFFICIAL_RELEASE_NOTES';
    } else if (fullText.includes('docs.') || fullText.includes('/docs') || fullText.includes('documentation')) {
      evidenceType = 'OFFICIAL_DOCUMENTATION';
    } else if (fullText.includes('blog') || fullText.includes('announce') || fullText.includes('news')) {
      evidenceType = 'OFFICIAL_ANNOUNCEMENT';
    }
  } else {
    // Strictly third party
    evidenceType = 'THIRD_PARTY_RESEARCH';
    credibility = 'SECONDARY_RELIABLE';
  }

  if (domain.includes('reddit') || domain.includes('news.ycombinator') || domain.includes('forum') || domain.includes('quora')) {
    evidenceType = 'COMMUNITY_DISCUSSION';
    credibility = 'UNVERIFIED';
  }

  return {
    isAccepted: true,
    domain,
    isOfficialVendor,
    evidenceType,
    credibility,
  };
}

interface CacheEntry {
  timestamp: number;
  result: SearchExecutionResult;
}

export class WebSearchService {
  private cache: Map<string, CacheEntry> = new Map();
  private apiKey?: string;
  private cacheTtlMs: number;
  private timeoutMs: number;
  private customFetch?: (input: any, init?: any) => Promise<any>;

  constructor(config: WebSearchToolConfig = {}) {
    this.apiKey = config.apiKey || process.env.TAVILY_API_KEY;
    this.cacheTtlMs = config.cacheTtlMs || 10 * 60 * 1000;
    this.timeoutMs = config.timeoutMs || 15000;
    this.customFetch = config.fetchFn;
  }

  /**
   * Primary detailed web search execution tracking plan, status, duration, and URL validation.
   * Includes bounded timeouts, exponential backoff retries for transient errors, and zero synthetic URLs.
   */
  async searchDetailed(rawInput: unknown, signal?: AbortSignal): Promise<SearchExecutionResult> {
    const startTime = Date.now();
    const input = WebSearchInputSchema.parse(rawInput);
    const cacheKey = `${input.query}::${input.topic}::${input.search_depth}::${input.time_range || ''}`;

    // Freshness policy check
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.cacheTtlMs)) {
      return cached.result;
    }

    // Check if client signal is already aborted before starting
    if (signal?.aborted) {
      console.log(`[SEARCH_CANCELLED] Query cancelled by client before start: "${input.query}"`);
      return {
        query: input.query,
        target_entity: input.target_entity,
        status: 'FAILED',
        results: [],
        total_found: 0,
        valid_count: 0,
        rejected_count: 0,
        duration_ms: 0,
        error: 'Search request cancelled by user',
      };
    }

    // Explicit error reporting when no API key is provided
    if (!this.apiKey && !this.customFetch) {
      const result: SearchExecutionResult = {
        query: input.query,
        target_entity: input.target_entity,
        status: 'NO_API_KEY',
        results: [],
        total_found: 0,
        valid_count: 0,
        rejected_count: 0,
        duration_ms: Date.now() - startTime,
        error: 'Tavily Search API key (TAVILY_API_KEY) is not configured in .env. Live web search cannot be executed.',
      };
      this.cache.set(cacheKey, { timestamp: Date.now(), result });
      return result;
    }

    // Execute with retry logic for transient errors (5xx, 429)
    let lastError: string | undefined;
    let isUserCancelled = false;
    let isTimedOut = false;
    const maxRetries = 2;
    const fetchImpl = this.customFetch || fetch;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal?.aborted) {
        isUserCancelled = true;
        console.log(`[SEARCH_CANCELLED] Query cancelled by client: "${input.query}"`);
        break;
      }

      const controller = new AbortController();
      let attemptTimedOut = false;
      const timeoutId = setTimeout(() => {
        attemptTimedOut = true;
        controller.abort();
      }, this.timeoutMs);

      const onExternalAbort = () => {
        controller.abort();
      };
      if (signal) {
        signal.addEventListener('abort', onExternalAbort, { once: true });
      }

      console.log(`[SEARCH_STARTED] "${input.query}" (entity: ${input.target_entity || 'none'}, attempt: ${attempt + 1}, depth: ${input.search_depth})`);

      try {
        const response = await fetchImpl('https://api.tavily.com/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            api_key: this.apiKey || 'test-key',
            query: input.query,
            topic: input.topic,
            search_depth: input.search_depth,
            time_range: input.time_range,
            include_answer: false,
            max_results: 5,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        if (signal) {
          signal.removeEventListener('abort', onExternalAbort);
        }

        const httpDurationMs = Date.now() - startTime;
        console.log(`[SEARCH_HTTP_RESPONSE] HTTP ${response.status} ${response.statusText} (${httpDurationMs}ms) for query "${input.query}"`);

        // Auth errors (401 / 403) - do NOT retry, report configuration error clearly
        if (response.status === 401 || response.status === 403) {
          const errorText = await response.text().catch(() => '');
          console.warn(`[SEARCH_FAILED] Tavily API auth failed (HTTP ${response.status}): ${errorText}`);
          const result: SearchExecutionResult = {
            query: input.query,
            target_entity: input.target_entity,
            status: 'FAILED',
            results: [],
            total_found: 0,
            valid_count: 0,
            rejected_count: 0,
            duration_ms: httpDurationMs,
            error: `Tavily API authentication failed (HTTP ${response.status}). Check that TAVILY_API_KEY in .env is valid.`,
          };
          this.cache.set(cacheKey, { timestamp: Date.now(), result });
          return result;
        }

        // Check if transient error eligible for retry (429 or 5xx)
        if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
          const delay = (attempt + 1) * 500;
          console.warn(`[SEARCH_RETRY] HTTP ${response.status} on "${input.query}". Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          console.warn(`[SEARCH_FAILED] Tavily HTTP ${response.status} for "${input.query}": ${errorText}`);
          const result: SearchExecutionResult = {
            query: input.query,
            target_entity: input.target_entity,
            status: 'FAILED',
            results: [],
            total_found: 0,
            valid_count: 0,
            rejected_count: 0,
            duration_ms: httpDurationMs,
            error: `Tavily API HTTP error ${response.status}: ${errorText || response.statusText}`,
          };
          this.cache.set(cacheKey, { timestamp: Date.now(), result });
          return result;
        }

        const data = await response.json();
        const rawResults: any[] = Array.isArray(data.results) ? data.results : [];
        const now = new Date().toISOString();

        const validResults: NormalizedSearchResult[] = [];
        const rejectedSources: RejectedSourceInfo[] = [];

        for (const r of rawResults) {
          const evalResult = evaluateSourceRelevance(r, input.target_entity);
          if (!evalResult.isAccepted) {
            rejectedSources.push({
              url: r.url || 'unknown',
              domain: evalResult.domain,
              title: r.title || 'Untitled',
              reason: evalResult.rejectionReason || 'Excluded by relevance filter',
            });
            continue;
          }

          validResults.push({
            title: r.title || 'Untitled Source',
            url: r.url,
            snippet: r.content || '',
            published_at: r.published_date || undefined,
            retrieved_at: now,
            domain: evalResult.domain,
            score: typeof r.score === 'number' ? r.score : 0.8,
            evidence_type: evalResult.evidenceType,
            credibility_category: evalResult.credibility,
          });
        }

        const duration_ms = Date.now() - startTime;
        const status = validResults.length > 0 ? 'SUCCESS' : 'EMPTY';
        if (status === 'SUCCESS') {
          console.log(`[SEARCH_SUCCEEDED] "${input.query}" returned ${validResults.length} valid sources (${rejectedSources.length} rejected, ${duration_ms}ms)`);
        } else {
          console.log(`[SEARCH_EMPTY] "${input.query}" returned 0 valid sources (${rejectedSources.length} rejected, ${duration_ms}ms)`);
        }

        const result: SearchExecutionResult = {
          query: input.query,
          target_entity: input.target_entity,
          status,
          results: validResults,
          rejected_sources: rejectedSources,
          total_found: rawResults.length,
          valid_count: validResults.length,
          rejected_count: rejectedSources.length,
          duration_ms,
          error: validResults.length === 0 ? 'No valid external sources returned from search provider' : undefined,
        };

        this.cache.set(cacheKey, { timestamp: Date.now(), result });
        return result;
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (signal) {
          signal.removeEventListener('abort', onExternalAbort);
        }

        if (attemptTimedOut) {
          isTimedOut = true;
          console.warn(`[SEARCH_TIMED_OUT] Query "${input.query}" timed out after ${this.timeoutMs}ms`);
          lastError = `Search timed out after ${this.timeoutMs}ms`;
        } else if (signal?.aborted) {
          isUserCancelled = true;
          console.log(`[SEARCH_CANCELLED] Query "${input.query}" cancelled by user`);
          lastError = 'Search request cancelled by user';
          break;
        } else {
          lastError = err.message || 'Network request failed';
          console.warn(`[SEARCH_FAILED] Query "${input.query}" attempt ${attempt + 1} failed: ${lastError}`);
        }

        if (attempt < maxRetries && !signal?.aborted && !isTimedOut) {
          await new Promise(r => setTimeout(r, (attempt + 1) * 500));
          continue;
        }
        break;
      }
    }

    const duration_ms = Date.now() - startTime;
    return {
      query: input.query,
      target_entity: input.target_entity,
      status: 'FAILED',
      results: [],
      total_found: 0,
      valid_count: 0,
      rejected_count: 0,
      duration_ms,
      error: isUserCancelled ? 'Search request cancelled by user' : isTimedOut ? `Search timed out after ${this.timeoutMs}ms` : `Search error: ${lastError || 'Network request failed'}`,
    };
  }

  /**
   * Compatibility wrapper returning just results array
   */
  async search(rawInput: unknown, signal?: AbortSignal): Promise<NormalizedSearchResult[]> {
    const res = await this.searchDetailed(rawInput, signal);
    return res.results;
  }

  private categorizeSource(url: string, title: string, snippet: string, targetEntity?: string): { evidenceType: EvidenceType; credibility: CredibilityCategory } {
    let domain = '';
    try {
      domain = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      domain = '';
    }

    const text = `${domain} ${title} ${snippet}`.toLowerCase();

    // Check if domain is in official vendor domains list
    let isOfficialVendor = false;
    if (targetEntity) {
      const entityKey = targetEntity.toLowerCase().trim();
      const officialDomains = VENDOR_OFFICIAL_DOMAINS[entityKey] || [];
      isOfficialVendor = officialDomains.some(d => domain === d || domain.endsWith('.' + d));
    } else {
      // Check across all vendor official domains
      for (const domains of Object.values(VENDOR_OFFICIAL_DOMAINS)) {
        if (domains.some(d => domain === d || domain.endsWith('.' + d))) {
          isOfficialVendor = true;
          break;
        }
      }
    }

    let evidenceType: EvidenceType = isOfficialVendor ? 'OFFICIAL_DOCUMENTATION' : 'THIRD_PARTY_RESEARCH';
    let credibility: CredibilityCategory = isOfficialVendor ? 'PRIMARY_OFFICIAL' : 'SECONDARY_RELIABLE';

    if (text.includes('pricing') || text.includes('/pricing') || text.includes('plans') || text.includes('cost')) {
      evidenceType = isOfficialVendor ? 'OFFICIAL_PRICING' : 'THIRD_PARTY_RESEARCH';
    } else if (text.includes('changelog') || text.includes('release notes') || text.includes('whats new') || text.includes('/releases')) {
      evidenceType = isOfficialVendor ? 'OFFICIAL_RELEASE_NOTES' : 'THIRD_PARTY_RESEARCH';
    } else if (text.includes('blog') || text.includes('announce')) {
      evidenceType = isOfficialVendor ? 'OFFICIAL_ANNOUNCEMENT' : 'THIRD_PARTY_RESEARCH';
    }

    if (domain.includes('reddit') || domain.includes('news.ycombinator') || domain.includes('forum')) {
      evidenceType = 'COMMUNITY_DISCUSSION';
      credibility = 'UNVERIFIED';
    }

    return { evidenceType, credibility };
  }
}
