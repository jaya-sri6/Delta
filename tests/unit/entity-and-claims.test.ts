import { describe, it, expect } from 'vitest';
import { createTestDatabase } from '../../src/server/db/database.js';
import { EntityRepo } from '../../src/server/db/repositories/entity.repo.js';
import { EntityResolver } from '../../src/server/services/entity-resolver.js';
import { TemporalComparisonEngine } from '../../src/server/services/temporal-comparison.js';
import { ClaimRepo } from '../../src/server/db/repositories/claim.repo.js';
import { CitationValidator } from '../../src/server/services/citation-validator.js';
import { Evidence } from '../../src/server/types/index.js';

describe('Entity, Claims and Comparison Engine', () => {
  const db = createTestDatabase();
  const entityRepo = new EntityRepo(db);
  const entityResolver = new EntityResolver(entityRepo);
  const comparisonEngine = new TemporalComparisonEngine();
  const claimRepo = new ClaimRepo(db);
  const citationValidator = new CitationValidator();

  it('resolves aliases conservatively and accurately', () => {
    const postgres = entityResolver.resolve('postgres');
    expect(postgres).toBeDefined();
    expect(postgres!.canonical_name).toBe('PostgreSQL');

    const pgsql = entityResolver.resolve('pgsql');
    expect(pgsql?.canonical_name).toBe('PostgreSQL');

    const hubspot = entityResolver.resolve('hubspot crm');
    expect(hubspot?.canonical_name).toBe('HubSpot');

    const neon = entityResolver.resolve('neon serverless');
    expect(neon?.canonical_name).toBe('Neon');
  });

  it('extracts multiple entities from natural text', () => {
    const text = 'Compare HubSpot, Zoho CRM, and Salesforce against Postgres hosting on Supabase or Neon';
    const entities = entityResolver.extractEntitiesFromText(text);
    const names = entities.map(e => e.canonical_name);

    expect(names).toContain('HubSpot');
    expect(names).toContain('Zoho CRM');
    expect(names).toContain('Salesforce');
    expect(names).toContain('PostgreSQL');
    expect(names).toContain('Supabase');
    expect(names).toContain('Neon');
  });

  it('normalizes pricing correctly across billing frequencies and seats', () => {
    const p1 = comparisonEngine.normalizePrice('$100/seat/month billed annually');
    expect(p1).toBeDefined();
    expect(p1!.amount).toBe(100);
    expect(p1!.currency).toBe('USD');
    expect(p1!.billing_period).toBe('per_seat_annual');

    const p2 = comparisonEngine.normalizePrice('25 USD/month');
    expect(p2!.amount).toBe(25);
    expect(p2!.billing_period).toBe('monthly');

    const p3 = comparisonEngine.normalizePrice('€14/user/mo');
    expect(p3!.currency).toBe('EUR');
    expect(p3!.billing_period).toBe('per_seat_monthly');
  });

  it('refuses to equate incompatible billing conditions', () => {
    const monthly = comparisonEngine.normalizePrice('$20/month')!;
    const annual = comparisonEngine.normalizePrice('$200/year')!;
    expect(comparisonEngine.arePricesComparable(monthly, annual)).toBe(false);

    const usd = comparisonEngine.normalizePrice('$20/month')!;
    const eur = comparisonEngine.normalizePrice('€20/month')!;
    expect(comparisonEngine.arePricesComparable(usd, eur)).toBe(false);
  });

  it('detects price increase, decrease, and unchanged deterministic statuses', () => {
    const histClaim = {
      id: 'c1',
      subject_entity_id: 'e1',
      predicate: 'pricing_monthly',
      current_value: '$20/month',
      normalized_value: { amount: 20, currency: 'USD', billing_period: 'monthly' },
      verification_status: 'VERIFIED' as const,
      first_observed_at: '2026-11-01T00:00:00Z',
      last_verified_at: '2026-11-01T00:00:00Z',
      confidence: 1.0,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
    };

    // Unchanged
    const resUnchanged = comparisonEngine.compare(
      histClaim,
      [],
      'Provider A',
      'pricing_monthly',
      '$20/month'
    );
    expect(resUnchanged.status).toBe('UNCHANGED');
    expect(resUnchanged.percentage_difference).toBe(0);

    // Increased
    const resInc = comparisonEngine.compare(
      histClaim,
      [],
      'Provider A',
      'pricing_monthly',
      '$25/month'
    );
    expect(resInc.status).toBe('INCREASED');
    expect(resInc.percentage_difference).toBe(25);

    // Decreased
    const resDec = comparisonEngine.compare(
      histClaim,
      [],
      'Provider A',
      'pricing_monthly',
      '$15/month'
    );
    expect(resDec.status).toBe('DECREASED');
    expect(resDec.percentage_difference).toBe(-25);
  });

  it('preserves immutable historical claim versions on update', () => {
    const ent = entityRepo.findOrCreate('TestEntity', 'PRODUCT');
    const { claim } = claimRepo.upsertClaim(
      ent.id,
      'price',
      '$10/mo',
      { amount: 10, currency: 'USD', billing_period: 'monthly' },
      'VERIFIED',
      '2026-11-01T10:00:00Z'
    );

    // Update claim with new value
    claimRepo.upsertClaim(
      ent.id,
      'price',
      '$12/mo',
      { amount: 12, currency: 'USD', billing_period: 'monthly' },
      'VERIFIED',
      '2026-11-08T10:00:00Z',
      undefined,
      undefined,
      'Annual price revision'
    );

    const versions = claimRepo.getClaimVersions(claim.id);
    expect(versions.length).toBe(2);
    expect(versions[0].value).toBe('$10/mo');
    expect(versions[1].value).toBe('$12/mo');
    expect(versions[1].change_reason).toBe('Annual price revision');
  });

  it('validates citations against stored evidence URLs and rejects hallucinations', () => {
    const sampleEvidence: Evidence[] = [
      {
        id: 'ev1',
        title: 'Neon Official Pricing',
        url: 'https://neon.tech/pricing',
        domain: 'neon.tech',
        snippet: 'Launch plan is $19',
        retrieved_at: new Date().toISOString(),
        evidence_type: 'OFFICIAL_PRICING',
        credibility_category: 'PRIMARY_OFFICIAL',
      }
    ];

    const textWithValidAndInventedLinks = `According to [Official Plan](https://neon.tech/pricing), it costs $19. Some blog [claims this](https://hallucinated-invented-source.org/fake) changed.`;
    const { validatedText, report } = citationValidator.validate(textWithValidAndInventedLinks, sampleEvidence);

    expect(report.rejectedUrls).toContain('https://hallucinated-invented-source.org/fake');
    expect(report.validCitations.length).toBeGreaterThan(0);
    expect(validatedText).not.toContain('(https://hallucinated-invented-source.org/fake)');
  });
});

