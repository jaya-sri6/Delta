import { describe, it, expect } from 'vitest';
import { evaluateSourceRelevance, validateExternalUrl, WebSearchService } from '../../src/server/services/web-search.js';
import { TemporalComparisonEngine } from '../../src/server/services/temporal-comparison.js';
import { AnswerSynthesizer } from '../../src/server/services/answer-synthesizer.js';
import { IntentClassifier } from '../../src/server/services/intent-classifier.js';
import { ResearchPlanner } from '../../src/server/services/research-planner.js';
import { TemporalResolver, FixedClock } from '../../src/server/services/temporal-resolver.js';
import { MemoryRetrievalEngine } from '../../src/server/services/memory-retrieval.js';
import { createTestDatabase } from '../../src/server/db/database.js';
import { seedDemoData } from '../../src/server/db/seed.js';
import { ConversationRepo, MessageRepo } from '../../src/server/db/repositories/conversation.repo.js';
import { EventRepo } from '../../src/server/db/repositories/event.repo.js';
import { MemoryRepo } from '../../src/server/db/repositories/memory.repo.js';
import { ClaimRepo } from '../../src/server/db/repositories/claim.repo.js';
import { EntityRepo } from '../../src/server/db/repositories/entity.repo.js';
import { Claim, Evidence, ComparisonResult } from '../../src/server/types/index.js';

describe('DELTA Evidence Verification Remediation — 10 Required Tests', () => {
  const comparisonEngine = new TemporalComparisonEngine();
  const synthesizer = new AnswerSynthesizer();
  const intentClassifier = new IntentClassifier();
  const researchPlanner = new ResearchPlanner();
  const fixedClock = new FixedClock(new Date('2026-11-10T12:00:00Z'));
  const temporalResolver = new TemporalResolver(fixedClock, 'Asia/Kolkata');

  const db = createTestDatabase();
  seedDemoData(db, 'test_user_remediation');
  const convRepo = new ConversationRepo(db);
  const msgRepo = new MessageRepo(db);
  const eventRepo = new EventRepo(db);
  const memRepo = new MemoryRepo(db);
  const claimRepo = new ClaimRepo(db);
  const entityRepo = new EntityRepo(db);
  const memoryRetrieval = new MemoryRetrievalEngine(convRepo, msgRepo, eventRepo, memRepo, claimRepo, entityRepo);

  // 1. Third-party sources cannot be classified as official
  it('1. Third-party sources cannot be classified as official even if title mentions vendor', () => {
    const thirdPartyDomains = [
      'https://method.me/blog/hubspot-pricing-guide',
      'https://www.onepagecrm.com/blog/zoho-vs-onepagecrm',
      'https://www.emailtooltester.com/en/reviews/pipedrive-pricing',
      'https://jetadmin.io/integrations/freshsales-guide',
      'https://www.activepieces.com/pieces/salesforce',
      'https://metacto.com/posts/postgres-neon-cloud-review',
      'https://www.amazon.com/dp/B08N5WRWNW', // amazon.com is not aws.amazon.com
    ];

    for (const url of thirdPartyDomains) {
      const res = evaluateSourceRelevance(
        {
          url,
          title: 'Official Vendor Pricing Analysis & Changelog Review',
          content: 'Here is our detailed analysis of HubSpot, Zoho, and Salesforce official pricing and plans.',
        },
        'HubSpot'
      );

      expect(res.isOfficialVendor).toBe(false);
      expect(res.credibility).not.toBe('PRIMARY_OFFICIAL');
      expect(res.evidenceType).toBe('THIRD_PARTY_RESEARCH');
    }
  });

  // 2. Irrelevant sources cannot verify a claim
  it('2. Irrelevant sources are rejected and cannot verify a claim', () => {
    // A: Generic PostgreSQL release notes cannot verify Neon cloud pricing
    const pgRelease = evaluateSourceRelevance(
      {
        url: 'https://www.postgresql.org/about/news/postgresql-17-released-2722/',
        title: 'PostgreSQL 17 Released with Enhanced Query Performance',
        content: 'The PostgreSQL Global Development Group today announced the release of PostgreSQL 17.',
      },
      'Neon'
    );
    expect(pgRelease.isAccepted).toBe(false);
    expect(pgRelease.rejectionReason).toContain('Generic PostgreSQL');

    // B: Azure PostgreSQL release notes cannot verify AWS RDS prices
    const azureRelease = evaluateSourceRelevance(
      {
        url: 'https://azure.microsoft.com/en-us/updates/azure-database-for-postgresql-pricing/',
        title: 'Azure Database for PostgreSQL Flexible Server New Pricing Tier',
        content: 'Microsoft announces updated pricing for Azure PostgreSQL flexible servers.',
      },
      'AWS RDS'
    );
    expect(azureRelease.isAccepted).toBe(false);
    expect(azureRelease.rejectionReason).toContain('Azure');

    // C: Neon CRM and Neon lighting are rejected for Neon database hosting
    const neonCrm = evaluateSourceRelevance(
      {
        url: 'https://www.neoncrm.com/pricing/',
        title: 'Neon CRM Nonprofit Donor Management Software Pricing',
        content: 'Neon CRM starts at $99/mo for nonprofit donor tracking and fundraising campaigns.',
      },
      'Neon'
    );
    expect(neonCrm.isAccepted).toBe(false);
    expect(neonCrm.rejectionReason).toContain('Neon CRM');

    const neonSigns = evaluateSourceRelevance(
      {
        url: 'https://customneonsigns.com/shop',
        title: 'Custom LED Neon Signs and Wall Decor Lighting',
        content: 'Buy handcrafted glass neon signs and LED lighting for home and office decor.',
      },
      'Neon'
    );
    expect(neonSigns.isAccepted).toBe(false);
    expect(neonSigns.rejectionReason).toContain('sign/lighting decor');

    // D: Supabase changelog without plan rate specifics rejected for pricing
    const supabaseChangelog = evaluateSourceRelevance(
      {
        url: 'https://supabase.com/changelog/2026-11-auth-improvements',
        title: 'Supabase Changelog: Auth v3 Performance Improvements',
        content: 'We updated auth hooks and reduced latency for session verification by 40%.',
      },
      'Supabase'
    );
    expect(supabaseChangelog.isAccepted).toBe(false);
    expect(supabaseChangelog.rejectionReason).toContain('without plan rate specifics');
  });

  // 3. A historical value without current evidence remains UNVERIFIED
  it('3. A historical value without current evidence remains UNVERIFIED', () => {
    const historicalClaim: Claim = {
      id: 'claim-hubspot-hist',
      subject_entity_id: 'ent-hubspot',
      predicate: 'pricing_per_seat_annual',
      current_value: '$100/seat/month billed annually',
      normalized_value: { amount: 100, currency: 'USD', billing_period: 'per_seat_annual', seat_count: 20 },
      verification_status: 'VERIFIED',
      first_observed_at: '2026-11-03T10:00:00Z',
      last_verified_at: '2026-11-03T10:00:00Z',
      confidence: 1.0,
      created_at: '2026-11-03T10:00:00Z',
      updated_at: '2026-11-03T10:00:00Z',
    };

    // Empty evidence: search returned 0 valid sources
    const cmp = comparisonEngine.compare(historicalClaim, [], 'HubSpot', 'pricing');

    expect(cmp.status).toBe('UNVERIFIED');
    expect(cmp.verification_status).toBe('UNVERIFIED');
    expect(cmp.claim_id).toBe('claim-hubspot-hist');
    expect(cmp.historical_value).toBe('$100/seat/month billed annually');
    expect(cmp.current_value).toBe('Unverified from search results');
    expect(cmp.supporting_source_ids).toEqual([]);
    expect(cmp.verification_reason).toContain('Historical value is known, but no relevant current evidence directly supports');
  });

  // 4. Zero confirmed changes does not imply unchanged pricing
  it('4. Zero confirmed changes does not imply unchanged pricing when evidence is unverified', async () => {
    const unverifiedComparisons: ComparisonResult[] = [
      {
        claim_id: 'c1',
        entity: 'HubSpot',
        predicate: 'pricing',
        status: 'UNVERIFIED',
        verification_status: 'UNVERIFIED',
        verification_reason: 'No live evidence',
        historical_value: '$100/seat/mo',
        current_value: 'Unverified from search results',
        difference: null,
        percentage_difference: null,
        evidence_ids: [],
        evidence_urls: [],
        supporting_source_ids: [],
        confidence: 0.4,
        explanation: 'No current evidence.',
      },
    ];

    const context = memoryRetrieval.retrieve({ userId: 'test_user_remediation', query: 'Has HubSpot changed pricing?' });

    const answer = await synthesizer.synthesize({
      userMessage: 'Has any CRM changed pricing since Monday?',
      intent: 'CHANGE_DETECTION',
      context,
      comparisons: unverifiedComparisons,
      evidence: [],
      citations: [],
      searchStatus: 'INSUFFICIENT_EVIDENCE',
      searchErrorMessage: 'Tavily search returned no valid sources',
    });

    expect(answer).not.toMatch(/pricing is steady/i);
    expect(answer).not.toMatch(/none of the 5 shortlisted crm vendors have changed their core per-seat subscription price/i);
    expect(answer).toMatch(/zero confirmed changes does not prove/i);
  });

  // 5. UNVERIFIED claims cannot produce an unchanged conclusion
  it('5. UNVERIFIED claims produce explicit UNVERIFIED rows and cannot state pricing is confirmed unchanged', async () => {
    const unverifiedComparisons: ComparisonResult[] = [
      {
        claim_id: 'c1',
        entity: 'HubSpot',
        predicate: 'pricing',
        status: 'UNVERIFIED',
        verification_status: 'UNVERIFIED',
        verification_reason: 'No live evidence',
        historical_value: '$100/seat/mo',
        current_value: 'Unverified from search results',
        difference: null,
        percentage_difference: null,
        evidence_ids: [],
        evidence_urls: [],
        supporting_source_ids: [],
        confidence: 0.4,
        explanation: 'No current evidence.',
      },
    ];

    const context = memoryRetrieval.retrieve({ userId: 'test_user_remediation', query: 'CRM pricing' });

    const answer = await synthesizer.synthesize({
      userMessage: 'On Monday we shortlisted 5 CRM tools. Has any pricing changed?',
      intent: 'CHANGE_DETECTION',
      context,
      comparisons: unverifiedComparisons,
      evidence: [],
      citations: [],
      searchStatus: 'INSUFFICIENT_EVIDENCE',
    });

    expect(answer).toContain('**UNVERIFIED**');
    expect(answer).toContain('The historical price is known, but current pricing could not be independently verified.');
    expect(answer).not.toMatch(/current official pricing matches historical baseline snapshots across all five/i);
  });

  // 6. Billing-cycle mismatches cannot produce UNCHANGED
  it('6. Billing-cycle mismatches produce INCOMPARABLE_BILLING_CYCLE, never UNCHANGED', () => {
    const annualClaim: Claim = {
      id: 'claim-annual',
      subject_entity_id: 'ent-1',
      predicate: 'pricing',
      current_value: '$100/seat/month billed annually',
      normalized_value: { amount: 100, currency: 'USD', billing_period: 'per_seat_annual', seat_count: 20 },
      verification_status: 'VERIFIED',
      first_observed_at: '2026-11-03T10:00:00Z',
      last_verified_at: '2026-11-03T10:00:00Z',
      confidence: 1.0,
      created_at: '2026-11-03T10:00:00Z',
      updated_at: '2026-11-03T10:00:00Z',
    };

    const monthlyEvidence: Evidence[] = [
      {
        id: 'ev-month',
        research_session_id: 's1',
        title: 'HubSpot Pricing Month-to-Month',
        url: 'https://www.hubspot.com/pricing',
        domain: 'hubspot.com',
        snippet: 'HubSpot Sales Hub Pro is $120 per user per month with month-to-month billing.',
        retrieved_at: '2026-11-10T12:00:00Z',
        evidence_type: 'OFFICIAL_PRICING',
        credibility_category: 'PRIMARY_OFFICIAL',
      },
    ];

    const cmp = comparisonEngine.compare(annualClaim, monthlyEvidence, 'HubSpot', 'pricing');

    expect(cmp.status).toBe('INCOMPARABLE_BILLING_CYCLE');
    expect(cmp.verification_status).toBe('INCOMPARABLE_BILLING_CYCLE');
    expect(cmp.status).not.toBe('UNCHANGED');
    expect(cmp.verification_reason).toContain('Billing-cycle mismatch');
  });

  // 7. A source must support the specific claim it is attached to
  it('7. A source mentioning a product generally does not verify technical or pricing metrics', () => {
    const pricingClaim: Claim = {
      id: 'claim-neon-price',
      subject_entity_id: 'ent-neon',
      predicate: 'pricing',
      current_value: '$19/mo',
      normalized_value: { amount: 19, currency: 'USD', billing_period: 'monthly' },
      verification_status: 'VERIFIED',
      first_observed_at: '2026-11-03T10:00:00Z',
      last_verified_at: '2026-11-03T10:00:00Z',
      confidence: 1.0,
      created_at: '2026-11-03T10:00:00Z',
      updated_at: '2026-11-03T10:00:00Z',
    };

    // Generic source mentions "Neon" but contains zero prices or plan tiers
    const genericNeonEvidence: Evidence[] = [
      {
        id: 'ev-neon-generic',
        research_session_id: 's1',
        title: 'Getting Started with Neon Developer Tools',
        url: 'https://neon.tech/docs/introduction',
        domain: 'neon.tech',
        snippet: 'Neon provides serverless PostgreSQL with database branching for modern dev teams.',
        retrieved_at: '2026-11-10T12:00:00Z',
        evidence_type: 'OFFICIAL_DOCUMENTATION',
        credibility_category: 'PRIMARY_OFFICIAL',
      },
    ];

    const cmpPrice = comparisonEngine.compare(pricingClaim, genericNeonEvidence, 'Neon', 'pricing');
    expect(cmpPrice.status).toBe('UNVERIFIED');
    expect(cmpPrice.verification_status).toBe('UNVERIFIED');

    const storageClaim: Claim = {
      ...pricingClaim,
      id: 'claim-neon-storage',
      predicate: 'storage',
      current_value: '10 GB storage',
    };
    const cmpStorage = comparisonEngine.compare(storageClaim, genericNeonEvidence, 'Neon', 'storage');
    expect(cmpStorage.status).toBe('UNVERIFIED');

    const pitrClaim: Claim = {
      ...pricingClaim,
      id: 'claim-neon-pitr',
      predicate: 'pitr_retention',
      current_value: '30-day point-in-time recovery',
    };
    const cmpPitr = comparisonEngine.compare(pitrClaim, genericNeonEvidence, 'Neon', 'pitr');
    expect(cmpPitr.status).toBe('UNVERIFIED');
  });

  // 8. Cross-topic CRM and PostgreSQL retrieval remains intact
  it('8. Cross-topic CRM and PostgreSQL retrieval independently targets demo fixtures without cross-contamination', () => {
    const multiQuery = 'What did we decide about CRM pricing? Also, what did we research about PostgreSQL hosting?';
    const topics = intentClassifier.decomposeIntoTopics(multiQuery);
    expect(topics.length).toBe(2);

    const crmTopic = topics.find(t => t.domain === 'CRM')!;
    const pgTopic = topics.find(t => t.domain === 'DATABASE_HOSTING')!;
    expect(crmTopic).toBeDefined();
    expect(pgTopic).toBeDefined();

    const crmContext = memoryRetrieval.retrieve({ userId: 'test_user_remediation', query: crmTopic.query, targetDomain: 'CRM' });
    const pgContext = memoryRetrieval.retrieve({ userId: 'test_user_remediation', query: pgTopic.query, targetDomain: 'DATABASE_HOSTING' });

    expect(crmContext.target_conversation?.id).toBe('demo-conv-crm-monday');
    expect(pgContext.target_conversation?.id).toBe('demo-conv-postgres-last-tuesday');

    const crmEntityNames = crmContext.entities.map(e => e.canonical_name);
    expect(crmEntityNames).toContain('HubSpot');
    expect(crmEntityNames).not.toContain('Neon');

    const pgEntityNames = pgContext.entities.map(e => e.canonical_name);
    expect(pgEntityNames).toContain('Neon');
    expect(pgEntityNames).not.toContain('HubSpot');
  });

  // 9. Historical-only recall does not trigger Tavily
  it('9. Historical-only recall does not trigger Tavily search or plan queries', () => {
    const recallQuery = 'What did we decide about CRM pricing on Monday?';
    const classification = intentClassifier.classify(recallQuery);
    expect(classification.intent).toBe('HISTORICAL_RECALL');

    const context = memoryRetrieval.retrieve({ userId: 'test_user_remediation', query: recallQuery });
    const plan = researchPlanner.createPlan(recallQuery, classification, temporalResolver.resolve('Monday'), context);

    expect(plan.search_required).toBe(false);
    expect(plan.search_queries.length).toBe(0);
  });

  // 10. Conflicting sources produce CONFLICTING
  it('10. Conflicting sources produce CONFLICTING status with audit details', async () => {
    const pipedriveClaim: Claim = {
      id: 'claim-pipedrive',
      subject_entity_id: 'ent-pipedrive',
      predicate: 'pricing',
      current_value: '$29/user/month billed annually',
      normalized_value: { amount: 29, currency: 'USD', billing_period: 'per_seat_annual' },
      verification_status: 'VERIFIED',
      first_observed_at: '2026-11-03T10:00:00Z',
      last_verified_at: '2026-11-03T10:00:00Z',
      confidence: 1.0,
      created_at: '2026-11-03T10:00:00Z',
      updated_at: '2026-11-03T10:00:00Z',
    };

    const conflictingEvidence: Evidence[] = [
      {
        id: 'ev-1',
        research_session_id: 's1',
        title: 'Pipedrive Official Pricing Schedule',
        url: 'https://www.pipedrive.com/en/pricing',
        domain: 'pipedrive.com',
        snippet: 'Pipedrive Advanced plan is $29 per user per month billed annually.',
        retrieved_at: '2026-11-10T12:00:00Z',
        evidence_type: 'OFFICIAL_PRICING',
        credibility_category: 'PRIMARY_OFFICIAL',
      },
      {
        id: 'ev-2',
        research_session_id: 's1',
        title: 'Pipedrive 2026 Tier Update',
        url: 'https://www.pipedrive.com/en/pricing-update',
        domain: 'pipedrive.com',
        snippet: 'Starting 2026, Pipedrive Advanced plan is $39 per user per month billed annually.',
        retrieved_at: '2026-11-10T12:00:00Z',
        evidence_type: 'OFFICIAL_PRICING',
        credibility_category: 'PRIMARY_OFFICIAL',
      },
    ];

    const cmp = comparisonEngine.compare(pipedriveClaim, conflictingEvidence, 'Pipedrive', 'pricing');

    expect(cmp.status).toBe('CONFLICTING');
    expect(cmp.verification_status).toBe('CONFLICTING');
    expect(cmp.verification_reason).toContain('Conflicting price reports');
    expect(cmp.explanation).toContain('Available sources disagree');

    // Synthesis should render CONFLICTING properly
    const context = memoryRetrieval.retrieve({ userId: 'test_user_remediation', query: 'Pipedrive pricing' });
    const answer = await synthesizer.synthesize({
      userMessage: 'Has Pipedrive changed pricing?',
      intent: 'CHANGE_DETECTION',
      context,
      comparisons: [cmp],
      evidence: conflictingEvidence,
      citations: [
        {
          index: 1,
          id: 'ev-1',
          url: 'https://www.pipedrive.com/en/pricing',
          title: 'Pipedrive Pricing',
          domain: 'pipedrive.com',
          evidence_type: 'OFFICIAL_PRICING',
          credibility_category: 'PRIMARY_OFFICIAL',
        },
      ],
      searchStatus: 'SUCCESS',
    });

    expect(answer).toContain('**CONFLICTING**');
    expect(answer).toContain('Available sources disagree; this requires further verification.');
  });
});
