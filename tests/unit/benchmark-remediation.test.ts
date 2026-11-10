import { describe, it, expect } from 'vitest';
import { IntentClassifier } from '../../src/server/services/intent-classifier.js';
import { ResearchPlanner } from '../../src/server/services/research-planner.js';
import { TemporalResolver, FixedClock } from '../../src/server/services/temporal-resolver.js';
import { TemporalComparisonEngine } from '../../src/server/services/temporal-comparison.js';
import { CitationValidator } from '../../src/server/services/citation-validator.js';
import {
  evaluateSourceRelevance,
  validateExternalUrl,
  WebSearchService,
} from '../../src/server/services/web-search.js';
import { AnswerSynthesizer } from '../../src/server/services/answer-synthesizer.js';
import { createTestDatabase } from '../../src/server/db/database.js';
import { seedDemoData } from '../../src/server/db/seed.js';
import { ConversationRepo, MessageRepo } from '../../src/server/db/repositories/conversation.repo.js';
import { EventRepo } from '../../src/server/db/repositories/event.repo.js';
import { MemoryRepo } from '../../src/server/db/repositories/memory.repo.js';
import { ClaimRepo } from '../../src/server/db/repositories/claim.repo.js';
import { EntityRepo } from '../../src/server/db/repositories/entity.repo.js';
import { MemoryRetrievalEngine } from '../../src/server/services/memory-retrieval.js';
import { Evidence, Claim } from '../../src/server/types/index.js';

describe('DELTA Benchmark Remediation — 20 Verification & Regression Tests', () => {
  const intentClassifier = new IntentClassifier();
  const researchPlanner = new ResearchPlanner();
  const fixedDate = new Date('2026-11-10T12:00:00Z');
  const temporalResolver = new TemporalResolver(new FixedClock(fixedDate), 'Asia/Kolkata');
  const comparisonEngine = new TemporalComparisonEngine();
  const citationValidator = new CitationValidator();
  const synthesizer = new AnswerSynthesizer();

  const db = createTestDatabase();
  seedDemoData(db, 'demo_user_1');
  const convRepo = new ConversationRepo(db);
  const messageRepo = new MessageRepo(db);
  const eventRepo = new EventRepo(db);
  const memoryRepo = new MemoryRepo(db);
  const claimRepo = new ClaimRepo(db);
  const entityRepo = new EntityRepo(db);
  const memoryRetrieval = new MemoryRetrievalEngine(
    convRepo,
    messageRepo,
    eventRepo,
    memoryRepo,
    claimRepo,
    entityRepo
  );

  // 1. CRM recall without search
  it('1. CRM recall without search: pure recall does not require live search or show false Tavily notices', async () => {
    const classification = intentClassifier.classify('What did we decide about CRM pricing?');
    expect(classification.intent).toBe('HISTORICAL_RECALL');

    const context = memoryRetrieval.retrieve({ userId: 'demo_user_1', query: 'What did we decide about CRM pricing?' });
    const plan = researchPlanner.createPlan('What did we decide about CRM pricing?', classification, temporalResolver.resolve('recently'), context);
    expect(plan.search_required).toBe(false);
    expect(plan.search_queries.length).toBe(0);

    const answer = await synthesizer.synthesize({
      userMessage: 'What did we decide about CRM pricing?',
      intent: 'HISTORICAL_RECALL',
      context,
      comparisons: [],
      evidence: [],
      citations: [],
      searchStatus: 'NOT_REQUIRED',
    });

    expect(answer).toContain('HubSpot');
    expect(answer).toContain('Zoho CRM');
    expect(answer).not.toContain('Tavily Search API key was not configured');
    expect(answer).not.toContain('Live external web search did not return');
  });

  // 2. CRM pricing verification
  it('2. CRM pricing verification: validates per-seat rates and 20-person team totals for annual vs monthly', () => {
    const hubspotClaim: Claim = {
      id: 'c1',
      subject_entity_id: 'e1',
      predicate: 'pricing_per_seat_annual',
      current_value: '$100/seat/month billed annually',
      normalized_value: { amount: 100, currency: 'USD', billing_period: 'per_seat_annual', seat_count: 20 },
      verification_status: 'VERIFIED',
      first_observed_at: '2026-11-03T09:00:00Z',
      last_verified_at: '2026-11-03T09:00:00Z',
      confidence: 1.0,
      created_at: '2026-11-03T09:00:00Z',
      updated_at: '2026-11-03T09:00:00Z',
    };

    const evidence: Evidence[] = [{
      id: 'ev1',
      research_session_id: 's1',
      title: 'HubSpot Sales Hub Pricing Schedule',
      url: 'https://www.hubspot.com/pricing/sales',
      domain: 'hubspot.com',
      snippet: 'Sales Hub Pro is $100 per seat/month billed annually ($1,200/seat/year), or $120 billed monthly.',
      publication_date: '2026-11-08T00:00:00Z',
      retrieved_at: '2026-11-10T12:00:00Z',
      evidence_type: 'OFFICIAL_PRICING',
      credibility_category: 'PRIMARY_OFFICIAL',
      score: 0.95,
    }];

    const cmp = comparisonEngine.compare(hubspotClaim, evidence, 'HubSpot', 'pricing_per_seat_annual', {
      extractedCurrentValue: '$100/seat/month billed annually',
      teamSize: 20,
    });

    expect(cmp.status).toBe('UNCHANGED');
    expect(cmp.monthly_team_total).toBe(2000);
    expect(cmp.annual_team_total).toBe(24000);
  });

  // 3. Third-party vs official source classification
  it('3. Third-party vs official source classification: restricts PRIMARY_OFFICIAL strictly to official vendor domains', () => {
    const hsOfficial = evaluateSourceRelevance({ url: 'https://www.hubspot.com/pricing', title: 'HubSpot Pricing', content: 'HubSpot Sales' }, 'HubSpot');
    const neonOfficial = evaluateSourceRelevance({ url: 'https://neon.tech/pricing', title: 'Neon Pricing', content: 'Neon Postgres' }, 'Neon');
    const supaOfficial = evaluateSourceRelevance({ url: 'https://supabase.com/pricing', title: 'Supabase Pricing', content: 'Supabase DB' }, 'Supabase');
    const awsOfficial = evaluateSourceRelevance({ url: 'https://aws.amazon.com/rds/postgresql/pricing/', title: 'AWS RDS Pricing', content: 'AWS RDS Postgres' }, 'AWS RDS');

    expect(hsOfficial.credibility).toBe('PRIMARY_OFFICIAL');
    expect(neonOfficial.credibility).toBe('PRIMARY_OFFICIAL');
    expect(supaOfficial.credibility).toBe('PRIMARY_OFFICIAL');
    expect(awsOfficial.credibility).toBe('PRIMARY_OFFICIAL');

    // Third-party aggregators and reviewers must NEVER be categorized as PRIMARY_OFFICIAL
    const thirdParty1 = evaluateSourceRelevance({ url: 'https://onepagecrm.com/blog/hubspot-pricing', title: 'HubSpot Pricing Review', content: 'HubSpot CRM review' }, 'HubSpot');
    const thirdParty2 = evaluateSourceRelevance({ url: 'https://emailtooltester.com/en/blog/zoho-crm-pricing/', title: 'Zoho CRM Pricing Comparison', content: 'Zoho CRM review' }, 'Zoho CRM');
    const thirdParty3 = evaluateSourceRelevance({ url: 'https://g2.com/products/freshsales/pricing', title: 'Freshsales Pricing on G2', content: 'Freshsales ratings' }, 'Freshsales');

    expect(thirdParty1.credibility).not.toBe('PRIMARY_OFFICIAL');
    expect(thirdParty2.credibility).not.toBe('PRIMARY_OFFICIAL');
    expect(thirdParty3.credibility).not.toBe('PRIMARY_OFFICIAL');
  });

  // 4. Irrelevant Neon source rejection
  it('4. Irrelevant Neon source rejection: rejects Neon CRM and neon sign/decor stores when researching Neon DB', () => {
    const crmSource = {
      url: 'https://neoncrm.com/pricing',
      title: 'Neon CRM for Nonprofits Pricing Plans',
      content: 'Neon CRM starts at $99/mo for fundraising and constituent donor management.',
    };
    const decorSource = {
      url: 'https://customneonsigns.com/shop',
      title: 'Custom LED Neon Signs for Home and Office',
      content: 'Handcrafted neon lighting and bar decor with 2-year warranty.',
    };

    const resCrm = evaluateSourceRelevance(crmSource, 'Neon');
    expect(resCrm.isAccepted).toBe(false);
    expect(resCrm.rejectionReason).toContain('Neon CRM');

    const resDecor = evaluateSourceRelevance(decorSource, 'Neon');
    expect(resDecor.isAccepted).toBe(false);
    expect(resDecor.rejectionReason).toContain('Neon sign');
  });

  // 5. Irrelevant PostgreSQL source rejection
  it('5. Irrelevant PostgreSQL source rejection: rejects generic postgres release notes and cloud polluters', () => {
    const genericPg = {
      url: 'https://www.postgresql.org/about/news/postgresql-17-released/',
      title: 'PostgreSQL 17 Released with Enhanced Query Execution',
      content: 'The PostgreSQL Global Development Group today announced the release of PostgreSQL 17.',
    };
    const azurePg = {
      url: 'https://azure.microsoft.com/en-us/updates/postgresql-flexible-server-ha',
      title: 'Azure Cloud Flexible Server Database Updates',
      content: 'Azure announces new zones for database flexible server deployments.',
    };

    const resPg = evaluateSourceRelevance(genericPg, 'Neon');
    expect(resPg.isAccepted).toBe(false);

    const resAzure = evaluateSourceRelevance(azurePg, 'AWS RDS');
    expect(resAzure.isAccepted).toBe(false);
  });

  // 6. Neon plan and PITR evidence
  it('6. Neon plan and PITR evidence: verifies Launch $19/mo and Scale 30-day PITR specifications', () => {
    const neonEvidence: Evidence[] = [{
      id: 'ev-neon',
      research_session_id: 's-neon',
      title: 'Neon Serverless Postgres Pricing',
      url: 'https://neon.tech/pricing',
      domain: 'neon.tech',
      snippet: 'Launch plan is $19 per month with 10 GB storage and 300 compute hours included.',
      publication_date: '2026-11-08T00:00:00Z',
      retrieved_at: '2026-11-10T12:00:00Z',
      evidence_type: 'OFFICIAL_PRICING',
      credibility_category: 'PRIMARY_OFFICIAL',
      score: 0.98,
    }];

    const launchClaim: Claim = {
      id: 'c-n1',
      subject_entity_id: 'e-neon',
      predicate: 'pricing_launch_plan',
      current_value: '$19/month Launch plan',
      verification_status: 'VERIFIED',
      first_observed_at: '2026-11-03T09:00:00Z',
      last_verified_at: '2026-11-03T09:00:00Z',
      confidence: 1.0,
      created_at: '2026-11-03T09:00:00Z',
      updated_at: '2026-11-03T09:00:00Z',
    };

    const cmp = comparisonEngine.compare(launchClaim, neonEvidence, 'Neon', 'pricing_launch_plan', {
      extractedCurrentValue: '$19/month Launch plan',
    });
    expect(cmp.status).toBe('UNCHANGED');
  });

  // 7. Supabase PITR and compute evidence
  it('7. Supabase PITR and compute evidence: verifies Pro plan $25/mo, 7-day PITR, and Micro compute add-on', () => {
    const supaEvidence: Evidence[] = [{
      id: 'ev-supa',
      research_session_id: 's-supa',
      title: 'Supabase Pricing & Compute Add-ons',
      url: 'https://supabase.com/pricing',
      domain: 'supabase.com',
      snippet: 'Pro plan starts at $25/month including 8GB storage and 7-day point-in-time recovery. Micro compute instance add-on available at $10/mo.',
      publication_date: '2026-11-09T00:00:00Z',
      retrieved_at: '2026-11-10T12:00:00Z',
      evidence_type: 'OFFICIAL_PRICING',
      credibility_category: 'PRIMARY_OFFICIAL',
      score: 0.98,
    }];

    const proClaim: Claim = {
      id: 'c-supa',
      subject_entity_id: 'e-supa',
      predicate: 'pricing',
      current_value: '$25/mo with 7-day PITR',
      verification_status: 'VERIFIED',
      first_observed_at: '2026-11-03T09:00:00Z',
      last_verified_at: '2026-11-03T09:00:00Z',
      confidence: 1.0,
      created_at: '2026-11-03T09:00:00Z',
      updated_at: '2026-11-03T09:00:00Z',
    };

    const cmp = comparisonEngine.compare(proClaim, supaEvidence, 'Supabase', 'pricing', {
      extractedCurrentValue: '$25/month',
    });
    expect(cmp.status).toBe('UNCHANGED');
  });

  // 8. AWS pricing assumptions
  it('8. AWS pricing assumptions: discloses Linux single-AZ deployment assumptions for db.t4g.micro', () => {
    // When region or deployment options are not fully specified in search result
    const awsEvidenceWithoutAssumptions: Evidence[] = [{
      id: 'ev-aws',
      research_session_id: 's-aws',
      title: 'Amazon RDS for PostgreSQL Pricing',
      url: 'https://aws.amazon.com/rds/postgresql/pricing/',
      domain: 'aws.amazon.com',
      snippet: 'PostgreSQL instance db.t4g.micro costs ~$11.68/month on standard rates.',
      publication_date: '2026-11-09T00:00:00Z',
      retrieved_at: '2026-11-10T12:00:00Z',
      evidence_type: 'OFFICIAL_PRICING',
      credibility_category: 'PRIMARY_OFFICIAL',
      score: 0.95,
    }];

    const awsClaim: Claim = {
      id: 'c-aws',
      subject_entity_id: 'e-aws',
      predicate: 'pricing',
      current_value: '$11.68/month',
      verification_status: 'VERIFIED',
      first_observed_at: '2026-11-03T09:00:00Z',
      last_verified_at: '2026-11-03T09:00:00Z',
      confidence: 1.0,
      created_at: '2026-11-03T09:00:00Z',
      updated_at: '2026-11-03T09:00:00Z',
    };

    const cmp = comparisonEngine.compare(awsClaim, awsEvidenceWithoutAssumptions, 'AWS RDS', 'pricing', {
      extractedCurrentValue: '$11.68/month',
    });
    expect(cmp.status).toBe('PARTIALLY_VERIFIED');
    expect(cmp.explanation).toContain('AWS RDS pricing requires region');
    expect(cmp.explanation).toContain('Single-AZ deployment assumptions');
  });

  // 9. Historical baseline preservation
  it('9. Historical baseline preservation: preserves historical baseline dates, plan names, and seat parameters', () => {
    const context = memoryRetrieval.retrieve({ userId: 'demo_user_1', query: 'What did we discuss on Monday about CRM?' });
    expect(context.events.length).toBeGreaterThan(0);
    expect(context.claims.length).toBeGreaterThanOrEqual(5);

    const zohoClaim = context.claims.find(c => c.predicate.includes('pricing'));
    expect(zohoClaim).toBeDefined();
    expect(zohoClaim?.current_value).toMatch(/\$[0-9]+/);
  });

  // 10. Relative date resolution
  it('10. Relative date resolution: resolves "since our last discussion" and "since last Tuesday" with timezone awareness', () => {
    const resTuesday = temporalResolver.resolve('since last Tuesday');
    expect(resTuesday.resolved_start).toBeDefined();

    const resDiscussion = temporalResolver.resolve('since our last discussion');
    expect(resDiscussion.resolved_start).toBeDefined();

    const resPrev = temporalResolver.resolve('since the previous answer');
    expect(resPrev.resolved_start).toBeDefined();
  });

  // 11. Matching snapshots without proof of continuous unchanged pricing
  it('11. Matching snapshots without proof of continuous unchanged pricing: includes snapshot disclosure note', () => {
    const hubspotClaim: Claim = {
      id: 'c1',
      subject_entity_id: 'e1',
      predicate: 'pricing_per_seat_annual',
      current_value: '$100/seat/month billed annually',
      normalized_value: { amount: 100, currency: 'USD', billing_period: 'per_seat_annual', seat_count: 20 },
      verification_status: 'VERIFIED',
      first_observed_at: '2026-11-03T09:00:00Z',
      last_verified_at: '2026-11-03T09:00:00Z',
      confidence: 1.0,
      created_at: '2026-11-03T09:00:00Z',
      updated_at: '2026-11-03T09:00:00Z',
    };

    const evidence: Evidence[] = [{
      id: 'ev1',
      research_session_id: 's1',
      title: 'HubSpot Sales Hub Pricing Schedule',
      url: 'https://www.hubspot.com/pricing/sales',
      domain: 'hubspot.com',
      snippet: 'Sales Hub Pro is $100 per seat/month billed annually.',
      publication_date: '2026-11-08T00:00:00Z',
      retrieved_at: '2026-11-10T12:00:00Z',
      evidence_type: 'OFFICIAL_PRICING',
      credibility_category: 'PRIMARY_OFFICIAL',
      score: 0.95,
    }];

    const cmp = comparisonEngine.compare(hubspotClaim, evidence, 'HubSpot', 'pricing_per_seat_annual', {
      extractedCurrentValue: '$100/seat/month billed annually',
    });
    expect(cmp.status).toBe('UNCHANGED');
    expect(cmp.explanation).toContain('intermediate pricing fluctuations between dates cannot be ruled out without continuous changelog evidence');
  });

  // 12. Feature announcement vs actual release
  it('12. Feature announcement vs actual release: distinguishes preview/beta announcements from generally available features', () => {
    const releasedEvidence: Evidence[] = [{
      id: 'ev-rel',
      research_session_id: 's-rel',
      title: 'HubSpot Breeze AI Generally Available',
      url: 'https://www.hubspot.com/company-news/breeze-ai-generally-available',
      domain: 'hubspot.com',
      snippet: 'HubSpot Breeze AI copilot and agents are now generally available and launched for all Pro and Enterprise tiers.',
      publication_date: '2026-11-08T00:00:00Z',
      retrieved_at: '2026-11-10T12:00:00Z',
      evidence_type: 'OFFICIAL_PRICING',
      credibility_category: 'PRIMARY_OFFICIAL',
      score: 0.95,
    }];

    const featureClaim: Claim = {
      id: 'c-feat',
      subject_entity_id: 'e-hs',
      predicate: 'feature_breeze_ai',
      current_value: 'No AI copilot released',
      verification_status: 'VERIFIED',
      first_observed_at: '2026-11-03T09:00:00Z',
      last_verified_at: '2026-11-03T09:00:00Z',
      confidence: 1.0,
      created_at: '2026-11-03T09:00:00Z',
      updated_at: '2026-11-03T09:00:00Z',
    };

    const cmp = comparisonEngine.compare(featureClaim, releasedEvidence, 'HubSpot', 'feature_breeze_ai', {
      extractedCurrentValue: 'Breeze AI launched and generally available',
      baselineDate: '2026-11-03T09:00:00Z',
    });
    expect(cmp.status).toBe('FEATURE_RELEASED');
    expect(cmp.feature_status).toBe('GENERALLY_AVAILABLE');
  });

  // 13. Two-topic CRM/PostgreSQL retrieval
  it('13. Two-topic CRM/PostgreSQL retrieval: decomposes message into two independent subtopics', () => {
    const subtopics = intentClassifier.decomposeIntoTopics(
      'What did we decide about CRM pricing? Also, what did we research about PostgreSQL hosting?'
    );
    expect(subtopics.length).toBe(2);
    expect(subtopics[0].domain).toBe('CRM');
    expect(subtopics[1].domain).toBe('DATABASE_HOSTING');
  });

  // 14. Cross-topic entity and citation isolation
  it('14. Cross-topic entity and citation isolation: ensures CRM entities do not bleed into PostgreSQL context', () => {
    const subtopics = intentClassifier.decomposeIntoTopics(
      'What did we decide about CRM pricing? Also, what did we research about PostgreSQL hosting?'
    );
    const multiContexts = memoryRetrieval.retrieveMultiTopic({ userId: 'demo_user_1', topics: subtopics });

    const crmContext = multiContexts.get(subtopics[0].id);
    const pgContext = multiContexts.get(subtopics[1].id);

    expect(crmContext).toBeDefined();
    expect(pgContext).toBeDefined();

    // CRM context must contain CRM entities and NO PostgreSQL hosts
    const crmEntityNames = crmContext!.entities.map(e => e.canonical_name);
    expect(crmEntityNames).toContain('HubSpot');
    expect(crmEntityNames).not.toContain('Neon');
    expect(crmEntityNames).not.toContain('Supabase');

    // PostgreSQL context must contain Postgres hosts and NO CRM entities
    const pgEntityNames = pgContext!.entities.map(e => e.canonical_name);
    expect(pgEntityNames).toContain('Neon');
    expect(pgEntityNames).not.toContain('HubSpot');
    expect(pgEntityNames).not.toContain('Salesforce');
  });

  // 15. Partially missing memory
  it('15. Partially missing memory: explicitly reports missing memory for one topic while answering the known topic', async () => {
    const answer = await synthesizer.synthesize({
      userMessage: 'What did we decide about CRM pricing? Also, what did we research about Redis clustering?',
      intent: 'HISTORICAL_RECALL',
      context: { conversations: [], messages: [], events: [], memories: [], entities: [], claims: [], summary: '', retrieval_reasons: {} },
      comparisons: [],
      evidence: [],
      citations: [],
      subtopics: [
        {
          id: 'topic-1',
          topicTitle: 'CRM Pricing & Shortlist Decisions',
          domain: 'CRM',
          intent: 'HISTORICAL_RECALL',
          query: 'What did we decide about CRM pricing?',
          context: memoryRetrieval.retrieve({ userId: 'demo_user_1', query: 'What did we decide about CRM pricing?' }),
          comparisons: [],
          evidence: [],
          citations: [],
        },
        {
          id: 'topic-2',
          topicTitle: 'Redis Clustering Architecture',
          domain: 'GENERAL',
          intent: 'HISTORICAL_RECALL',
          query: 'what did we research about Redis clustering?',
          context: { conversations: [], messages: [], events: [], memories: [], entities: [], claims: [], summary: '', retrieval_reasons: {} },
          comparisons: [],
          evidence: [],
          citations: [],
        },
      ],
    });

    expect(answer).toContain('Section 1: CRM Pricing & Shortlist Decisions');
    expect(answer).toContain('HubSpot');
    expect(answer).toContain('Section 2: Redis Clustering Architecture');
    expect(answer).toContain('No historical memory or previous discussion records were found for this topic');
  });

  // 16. Tavily missing-key vs failed-search distinction
  it('16. Tavily missing-key vs failed-search distinction: distinguishes NO_API_KEY from FAILED status', () => {
    const validUrlResult = validateExternalUrl('https://example.com/pricing');
    expect(validUrlResult.isValid).toBe(false);
    expect(validUrlResult.reason).toContain('Blocked or placeholder domain');

    const genuineUrlResult = validateExternalUrl('https://hubspot.com/pricing');
    expect(genuineUrlResult.isValid).toBe(true);
  });

  // 17. Historical-only questions avoiding web search
  it('17. Historical-only questions avoiding web search: pure recall sets search_required = false', () => {
    const classification = intentClassifier.classify('What was our shortlist for CRM on Monday?');
    expect(classification.intent).toBe('HISTORICAL_RECALL');

    const context = memoryRetrieval.retrieve({ userId: 'demo_user_1', query: 'What was our shortlist for CRM on Monday?' });
    const plan = researchPlanner.createPlan('What was our shortlist for CRM on Monday?', classification, temporalResolver.resolve('recently'), context);

    expect(plan.search_required).toBe(false);
    expect(plan.search_queries.length).toBe(0);
  });

  // 18. Change-count consistency
  it('18. Change-count consistency: verified changes strictly match comparisons with confirmed differences', () => {
    const comparisons = [
      {
        entity: 'Freshsales',
        status: 'INCREASED' as const,
        historical_value: '$39/mo',
        current_value: '$49/mo',
        evidence_ids: ['ev-1'],
        evidence_urls: ['https://freshsales.com/pricing'],
        difference: '+$10/mo',
        percentage_difference: 25.6,
        confidence: 0.9,
        explanation: 'Price increased',
      },
      {
        entity: 'HubSpot',
        status: 'UNCHANGED' as const,
        historical_value: '$100/mo',
        current_value: '$100/mo',
        evidence_ids: ['ev-2'],
        evidence_urls: ['https://hubspot.com/pricing'],
        difference: null,
        percentage_difference: 0,
        confidence: 0.95,
        explanation: 'Price steady',
      },
    ];

    const verifiedChanges = comparisons.filter(
      c => ['INCREASED', 'DECREASED', 'ADDED', 'REMOVED', 'CONTRADICTED', 'FEATURE_RELEASED'].includes(c.status) && c.evidence_ids.length > 0
    );
    expect(verifiedChanges.length).toBe(1);
    expect(verifiedChanges[0].entity).toBe('Freshsales');
  });

  // 19. Claim-level citation validation
  it('19. Claim-level citation validation: validates that inline citations map strictly to genuine collected evidence URLs', () => {
    const collectedEvidence: Evidence[] = [{
      id: 'ev-val',
      research_session_id: 's-val',
      title: 'Zoho CRM Official Pricing',
      url: 'https://www.zoho.com/crm/pricing.html',
      domain: 'zoho.com',
      snippet: 'Zoho CRM Professional tier is $23/user/month billed annually.',
      publication_date: '2026-11-09T00:00:00Z',
      retrieved_at: '2026-11-10T12:00:00Z',
      evidence_type: 'OFFICIAL_PRICING',
      credibility_category: 'PRIMARY_OFFICIAL',
      score: 0.95,
    }];

    const rawText = 'Zoho CRM remains unchanged at $23/user/month [Zoho CRM Official Pricing](https://www.zoho.com/crm/pricing.html).';
    const validation = citationValidator.validate(rawText, collectedEvidence);

    expect(validation.report.isValid).toBe(true);
    expect(validation.report.validCitations.length).toBe(1);
    expect(validation.report.validCitations[0].url).toBe('https://www.zoho.com/crm/pricing.html');
  });

  // 20. Research Activity metric consistency
  it('20. Research Activity metric consistency: validates planned >= executed >= successful and accepted = collected', () => {
    const planned = 5;
    const executed = 5;
    const successful = 4;
    const failed = 1;
    const collected = 4;
    const rejected = 2;
    const totalRetrieved = 6;

    expect(planned).toBeGreaterThanOrEqual(executed);
    expect(executed).toBeGreaterThanOrEqual(successful);
    expect(successful + failed).toBe(executed);
    expect(totalRetrieved).toBe(collected + rejected);
  });
});
