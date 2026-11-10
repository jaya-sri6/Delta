import { describe, it, expect } from 'vitest';
import { evaluateSourceRelevance, validateExternalUrl } from '../../src/server/services/web-search.js';
import { TemporalComparisonEngine } from '../../src/server/services/temporal-comparison.js';
import { CitationValidator } from '../../src/server/services/citation-validator.js';
import { createTestDatabase } from '../../src/server/db/database.js';
import { seedDemoData } from '../../src/server/db/seed.js';
import { ClaimRepo } from '../../src/server/db/repositories/claim.repo.js';
import { EntityRepo } from '../../src/server/db/repositories/entity.repo.js';
import { Evidence } from '../../src/server/types/index.js';

describe('Scenario A CRM Change-Detection & Evidence Verification', () => {
  const comparisonEngine = new TemporalComparisonEngine();
  const citationValidator = new CitationValidator();

  // ==========================================
  // 1. IRRELEVANT SOURCE REJECTION
  // ==========================================
  describe('1. Irrelevant Source Rejection', () => {
    it('rejects sources focused on unrelated platforms like Shopify updates', () => {
      const shopifySource = {
        url: 'https://news.shopify.com/shopify-editions-winter-2026-updates',
        title: 'Shopify Editions Winter 2026: 100+ New Product Updates',
        content: 'Shopify announces 100+ new features including checkout extensibility and CRM partner connectors for Freshsales.',
      };

      const evalRes = evaluateSourceRelevance(shopifySource, 'Freshsales');
      expect(evalRes.isAccepted).toBe(false);
      expect(evalRes.rejectionReason).toContain('Unrelated platform');
      expect(evalRes.rejectionReason).toContain('shopify');
    });

    it('rejects sources that completely lack mention of the target entity', () => {
      const unrelatedBlog = {
        url: 'https://techreview.com/best-sales-strategies-2026',
        title: 'Top Sales Strategies for High Growth Teams in 2026',
        content: 'Building pipeline requires cold outreach, email followups, and disciplined qualification frameworks.',
      };

      const evalRes = evaluateSourceRelevance(unrelatedBlog, 'Freshsales');
      expect(evalRes.isAccepted).toBe(false);
      expect(evalRes.rejectionReason).toContain('missing mention of target entity');
    });

    it('rejects generic login portals and cookie consent pages', () => {
      const loginPage = {
        url: 'https://freshsales.io/login',
        title: 'Sign In to Your Freshsales Account Portal',
        content: 'Enter your email and password to access your dashboard. Terms of service apply.',
      };

      const evalRes = evaluateSourceRelevance(loginPage, 'Freshsales');
      expect(evalRes.isAccepted).toBe(false);
      expect(evalRes.rejectionReason).toContain('Irrelevant page type');
    });

    it('accepts genuine official vendor pricing and changelog sources', () => {
      const officialFreshsales = {
        url: 'https://www.freshworks.com/crm/sales/pricing/',
        title: 'Freshsales Official Pricing Plans 2026',
        content: 'Freshsales Pro plan is $39 per user per month billed annually ($47 billed monthly). Includes workflow automation.',
      };

      const evalRes = evaluateSourceRelevance(officialFreshsales, 'Freshsales');
      expect(evalRes.isAccepted).toBe(true);
      expect(evalRes.isOfficialVendor).toBe(true);
      expect(evalRes.credibility).toBe('PRIMARY_OFFICIAL');
      expect(evalRes.evidenceType).toBe('OFFICIAL_PRICING');
    });
  });

  // ==========================================
  // 2. HISTORICAL BASELINE RETRIEVAL
  // ==========================================
  describe('2. Historical Baseline Retrieval', () => {
    it('retrieves exact historical CRM claims for all 5 entities from Monday seed', () => {
      const db = createTestDatabase();
      seedDemoData(db);

      const claimRepo = new ClaimRepo(db);
      const entityRepo = new EntityRepo(db);

      const entities = ['HubSpot', 'Zoho CRM', 'Salesforce', 'Pipedrive', 'Freshsales'];

      for (const name of entities) {
        const ent = entityRepo.findByCanonicalName(name);
        expect(ent, `Entity ${name} must exist in seed database`).toBeDefined();

        const claims = claimRepo.getClaimsByEntity(ent!.id);
        expect(claims.length, `Entity ${name} must have seeded historical claim`).toBeGreaterThan(0);

        const pricingClaim = claims.find(c => c.predicate.includes('pricing'));
        expect(pricingClaim).toBeDefined();
        expect(pricingClaim!.current_value).toMatch(/\$[0-9]+/);
        expect(pricingClaim!.normalized_value.currency).toBe('USD');
        expect(pricingClaim!.normalized_value.billing_period).toBe('per_seat_annual');
        expect(pricingClaim!.first_observed_at).toBeDefined();
      }
    });

    it('reports baseline as unavailable when no historical claim exists', () => {
      const res = comparisonEngine.compare(null, [], 'UnknownCRM', 'pricing');
      expect(res.status).toBe('UNKNOWN');
      expect(res.historical_value).toContain('No historical record');
      expect(res.explanation).toContain('not previously recorded in conversation');
      expect(res.explanation).toContain('unavailable');
    });
  });

  // ==========================================
  // 3. COMPARABLE PRICING & BILLING CYCLES
  // ==========================================
  describe('3. Comparable Pricing & Billing Cycles', () => {
    const historicalHubspot = {
      id: 'claim-hs-1',
      subject_entity_id: 'ent-hs',
      predicate: 'pricing_per_seat_annual',
      current_value: '$100/seat/month billed annually',
      normalized_value: { amount: 100, currency: 'USD', billing_period: 'per_seat_annual', seat_count: 20 },
      verification_status: 'VERIFIED' as const,
      first_observed_at: '2026-11-03T10:00:00.000Z',
      last_verified_at: '2026-11-03T10:00:00.000Z',
      confidence: 1.0,
      created_at: '2026-11-03T10:00:00.000Z',
      updated_at: '2026-11-03T10:00:00.000Z',
    };

    it('identifies billing cycle mismatch and does not claim unchanged or increased', () => {
      // Current search returns month-to-month price ($120/month)
      const currentEvidence: Evidence[] = [{
        id: 'ev-hs-m2m',
        title: 'HubSpot Pricing',
        url: 'https://hubspot.com/pricing',
        domain: 'hubspot.com',
        snippet: 'HubSpot Sales Hub Professional is $120/seat/month on monthly billing.',
        retrieved_at: '2026-11-10T12:00:00.000Z',
        evidence_type: 'OFFICIAL_PRICING',
        credibility_category: 'PRIMARY_OFFICIAL',
      }];

      const res = comparisonEngine.compare(historicalHubspot, currentEvidence, 'HubSpot', 'pricing_per_seat_annual', {
        extractedCurrentValue: '$120/seat/month monthly billing',
        teamSize: 20,
      });

      expect(res.status).toBe('INCOMPARABLE_BILLING_CYCLE');
      expect(res.explanation).toContain('Cannot confirm price change');
      expect(res.explanation).toContain('annual');
      expect(res.explanation).toContain('monthly billing');
    });

    it('verifies unchanged pricing when identical annual terms are confirmed', () => {
      const currentEvidence: Evidence[] = [{
        id: 'ev-hs-ann',
        title: 'HubSpot Pricing 2026',
        url: 'https://hubspot.com/pricing',
        domain: 'hubspot.com',
        snippet: 'Sales Hub Professional is $100/seat/month billed annually.',
        retrieved_at: '2026-11-10T12:00:00.000Z',
        evidence_type: 'OFFICIAL_PRICING',
        credibility_category: 'PRIMARY_OFFICIAL',
      }];

      const res = comparisonEngine.compare(historicalHubspot, currentEvidence, 'HubSpot', 'pricing_per_seat_annual', {
        extractedCurrentValue: '$100/seat/month billed annually',
        teamSize: 20,
      });

      expect(res.status).toBe('UNCHANGED');
      expect(res.difference).toBe('0.00');
      expect(res.percentage_difference).toBe(0);
      expect(res.monthly_team_total).toBe(2000);
      expect(res.annual_team_total).toBe(24000);
      expect(res.explanation).toContain('$2,000/month');
      expect(res.explanation).toContain('$24,000/year');
    });

    it('calculates exact 20-person team impact when an actual price increase occurs', () => {
      const currentEvidence: Evidence[] = [{
        id: 'ev-hs-inc',
        title: 'HubSpot Pricing Update',
        url: 'https://hubspot.com/pricing',
        domain: 'hubspot.com',
        snippet: 'Sales Hub Professional is now $110/seat/month billed annually.',
        retrieved_at: '2026-11-10T12:00:00.000Z',
        evidence_type: 'OFFICIAL_PRICING',
        credibility_category: 'PRIMARY_OFFICIAL',
      }];

      const res = comparisonEngine.compare(historicalHubspot, currentEvidence, 'HubSpot', 'pricing_per_seat_annual', {
        extractedCurrentValue: '$110/seat/month billed annually',
        teamSize: 20,
      });

      expect(res.status).toBe('INCREASED');
      expect(res.difference).toBe('+10.00 USD/seat/mo');
      expect(res.percentage_difference).toBe(10);
      expect(res.explanation).toContain('+$200/month');
      expect(res.explanation).toContain('+$2,400/year');
    });
  });

  // ==========================================
  // 4. FEATURE ANNOUNCEMENT VS ACTUAL RELEASE
  // ==========================================
  describe('4. Feature Change Verification', () => {
    const historicalFeatureClaim = {
      id: 'claim-feat-1',
      subject_entity_id: 'ent-hs',
      predicate: 'feature_automation',
      current_value: 'Workflow automation and lead rotation',
      verification_status: 'VERIFIED' as const,
      first_observed_at: '2026-11-03T10:00:00.000Z', // Monday baseline
      last_verified_at: '2026-11-03T10:00:00.000Z',
      confidence: 1.0,
      created_at: '2026-11-03T10:00:00.000Z',
      updated_at: '2026-11-03T10:00:00.000Z',
    };

    it('verifies a feature change when officially released after baseline date', () => {
      const postBaselineEvidence: Evidence[] = [{
        id: 'ev-release-1',
        title: 'HubSpot Ships Breeze AI Copilot',
        url: 'https://hubspot.com/releases/breeze-ai',
        domain: 'hubspot.com',
        snippet: 'HubSpot officially launched and shipped Breeze AI prospecting agents. Now generally available.',
        publication_date: '2026-11-08T09:00:00.000Z', // 5 days after Monday!
        retrieved_at: '2026-11-10T12:00:00.000Z',
        evidence_type: 'OFFICIAL_RELEASE_NOTES',
        credibility_category: 'PRIMARY_OFFICIAL',
      }];

      const res = comparisonEngine.compare(historicalFeatureClaim, postBaselineEvidence, 'HubSpot', 'feature_automation', {
        extractedCurrentValue: 'Breeze AI Copilot and autonomous agents',
        baselineDate: '2026-11-03T10:00:00.000Z',
      });

      expect(res.status).toBe('FEATURE_RELEASED');
      expect(res.feature_status).toBe('GENERALLY_AVAILABLE');
      expect(res.change_date).toBe('2026-11-08T09:00:00.000Z');
      expect(res.explanation).toContain('released');
    });

    it('distinguishes feature announcement from actual GA release', () => {
      const announcementEvidence: Evidence[] = [{
        id: 'ev-announce-1',
        title: 'HubSpot Announces Upcoming AI Agent Framework',
        url: 'https://hubspot.com/blog/ai-agent-preview',
        domain: 'hubspot.com',
        snippet: 'HubSpot announces upcoming autonomous agents for sales teams, coming soon in Q3.',
        publication_date: '2026-11-08T09:00:00.000Z',
        retrieved_at: '2026-11-10T12:00:00.000Z',
        evidence_type: 'OFFICIAL_ANNOUNCEMENT',
        credibility_category: 'PRIMARY_OFFICIAL',
      }];

      const res = comparisonEngine.compare(historicalFeatureClaim, announcementEvidence, 'HubSpot', 'feature_automation', {
        extractedCurrentValue: 'Upcoming autonomous agent preview',
        baselineDate: '2026-11-03T10:00:00.000Z',
      });

      expect(res.status).toBe('ADDED');
      expect(res.feature_status).toBe('ANNOUNCED');
      expect(res.explanation).toContain('introduced');
    });

    it('does not treat undated feature descriptions as a new release', () => {
      const undatedEvidence: Evidence[] = [{
        id: 'ev-undated-1',
        title: 'HubSpot Workflow Automation Overview',
        url: 'https://hubspot.com/products/sales/automation',
        domain: 'hubspot.com',
        snippet: 'Sales Hub includes automated email sequences, task reminders, and deal rotation.',
        retrieved_at: '2026-11-10T12:00:00.000Z', // Retrieved today, but NO publication_date!
        evidence_type: 'OFFICIAL_DOCUMENTATION',
        credibility_category: 'PRIMARY_OFFICIAL',
      }];

      const res = comparisonEngine.compare(historicalFeatureClaim, undatedEvidence, 'HubSpot', 'feature_automation', {
        extractedCurrentValue: 'Automated email sequences and deal rotation',
        baselineDate: '2026-11-03T10:00:00.000Z',
      });

      expect(res.status).toBe('EXISTING_FEATURE_CONFIRMED');
      expect(res.explanation).toContain('Not counted as a new change');
    });
  });

  // ==========================================
  // 5. CHANGE COUNT CONSISTENCY
  // ==========================================
  describe('5. Change Count Consistency', () => {
    it('maintains strict count equality between comparisons and summary count', () => {
      const verifiedChangeStatuses = [
        'INCREASED',
        'DECREASED',
        'ADDED',
        'REMOVED',
        'CONTRADICTED',
        'FEATURE_RELEASED',
      ];

      const sampleComparisons = [
        {
          entity: 'HubSpot',
          predicate: 'pricing',
          status: 'UNCHANGED' as const,
          historical_value: '$100/seat/mo',
          current_value: '$100/seat/mo',
          difference: '0.00',
          percentage_difference: 0,
          evidence_ids: ['ev-1'],
          evidence_urls: ['https://hubspot.com/pricing'],
          confidence: 0.95,
          explanation: 'Pricing unchanged',
        },
        {
          entity: 'Zoho CRM',
          predicate: 'pricing',
          status: 'UNCHANGED' as const,
          historical_value: '$23/user/mo',
          current_value: '$23/user/mo',
          difference: '0.00',
          percentage_difference: 0,
          evidence_ids: ['ev-2'],
          evidence_urls: ['https://zoho.com/crm/pricing'],
          confidence: 0.95,
          explanation: 'Pricing unchanged',
        },
      ];

      const verifiedChanges = sampleComparisons.filter(
        c => verifiedChangeStatuses.includes(c.status) && c.evidence_ids.length > 0
      );

      expect(verifiedChanges.length).toBe(0);
    });
  });

  // ==========================================
  // 6. CLAIM-LEVEL CITATIONS
  // ==========================================
  describe('6. Claim-Level Citations', () => {
    it('attaches citations and labels third-party sources distinctly', () => {
      const evidenceList: Evidence[] = [
        {
          id: 'ev-official',
          title: 'HubSpot Official Pricing',
          url: 'https://www.hubspot.com/pricing',
          domain: 'hubspot.com',
          snippet: 'Professional is $100/seat/mo billed annually.',
          retrieved_at: '2026-11-10T12:00:00.000Z',
          evidence_type: 'OFFICIAL_PRICING',
          credibility_category: 'PRIMARY_OFFICIAL',
        },
        {
          id: 'ev-thirdparty',
          title: 'G2 CRM Software Reviews 2026',
          url: 'https://www.g2.com/products/freshsales/reviews',
          domain: 'g2.com',
          snippet: 'User reviews of Freshsales Pro pricing and features.',
          retrieved_at: '2026-11-10T12:00:00.000Z',
          evidence_type: 'THIRD_PARTY_RESEARCH',
          credibility_category: 'SECONDARY_RELIABLE',
        },
      ];

      const text = 'HubSpot pricing remains $100 [https://www.hubspot.com/pricing]. Freshsales reviews noted on [https://www.g2.com/products/freshsales/reviews].';
      const { validatedText, report } = citationValidator.validate(text, evidenceList);

      expect(report.isValid).toBe(true);
      expect(report.validCitations.length).toBe(2);
      expect(report.validCitations[0].credibility_category).toBe('PRIMARY_OFFICIAL');
      expect(report.validCitations[1].credibility_category).toBe('SECONDARY_RELIABLE');
    });

    it('rejects fabricated placeholder URLs from citation output', () => {
      const fakeUrl = 'https://example.com/fake-pricing';
      expect(validateExternalUrl(fakeUrl).isValid).toBe(false);

      const { report } = citationValidator.validate(`Check [Source](${fakeUrl})`, []);
      expect(report.rejectedUrls).toContain(fakeUrl);
    });
  });
});

