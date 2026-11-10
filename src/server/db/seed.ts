import { DeltaDatabase, getDatabase } from './database.js';
import { ConversationRepo, MessageRepo } from './repositories/conversation.repo.js';
import { EntityRepo } from './repositories/entity.repo.js';
import { EventRepo } from './repositories/event.repo.js';
import { MemoryRepo } from './repositories/memory.repo.js';
import { ClaimRepo } from './repositories/claim.repo.js';
import { EvidenceRepo } from './repositories/evidence.repo.js';
import { randomUUID } from 'crypto';

export function seedDemoData(db: DeltaDatabase, userId: string = 'demo_user_1'): {
  conversationAId: string;
  conversationBId: string;
  conversationCId: string;
} {
  const conversationRepo = new ConversationRepo(db);
  const messageRepo = new MessageRepo(db);
  const entityRepo = new EntityRepo(db);
  const eventRepo = new EventRepo(db);
  const memoryRepo = new MemoryRepo(db);
  const claimRepo = new ClaimRepo(db);
  const evidenceRepo = new EvidenceRepo(db);

  // 1. Ensure user exists
  db.prepare(`
    INSERT OR REPLACE INTO users (id, name, timezone, created_at, updated_at)
    VALUES (?, ?, 'Asia/Kolkata', ?, ?)
  `).run(userId, 'Demo User', new Date().toISOString(), new Date().toISOString());

  // Calculate realistic calendar dates based on current reference date
  // Say current date is Tuesday 10 November 2026
  const now = new Date();
  
  // Monday of current week:
  const dayOfWeek = now.getDay(); // 0 is Sun, 1 is Mon, 2 is Tue
  const mondayOffset = (dayOfWeek + 6) % 7; // days since Monday
  const mondayDate = new Date(now);
  mondayDate.setDate(mondayDate.getDate() - mondayOffset);
  const mondayIso = mondayDate.toISOString();

  // Last Tuesday (7 days before this week's Tuesday)
  const lastTuesday = new Date(now);
  lastTuesday.setDate(lastTuesday.getDate() - 7);
  const lastTuesdayIso = lastTuesday.toISOString();

  // 3 November 2026
  const nov3 = new Date(now.getFullYear(), 10, 3, 14, 30, 0); // Month 10 is Nov (0-indexed)
  const nov3Iso = nov3.toISOString();

  // Create Entities
  const hubspot = entityRepo.findOrCreate('HubSpot', 'PRODUCT');
  const zoho = entityRepo.findOrCreate('Zoho CRM', 'PRODUCT');
  const salesforce = entityRepo.findOrCreate('Salesforce', 'PRODUCT');
  const pipedrive = entityRepo.findOrCreate('Pipedrive', 'PRODUCT');
  const freshsales = entityRepo.findOrCreate('Freshsales', 'PRODUCT');

  const neon = entityRepo.findOrCreate('Neon', 'PRODUCT');
  const supabase = entityRepo.findOrCreate('Supabase', 'PRODUCT');
  const awsRds = entityRepo.findOrCreate('AWS RDS', 'PRODUCT');
  const postgres = entityRepo.findOrCreate('PostgreSQL', 'TECHNOLOGY');

  // ==========================================
  // SCENARIO A: CRM Discussion on Monday
  // ==========================================
  const convAId = 'demo-conv-crm-monday';
  conversationRepo.create({
    id: convAId,
    user_id: userId,
    title: '[DEMO DATA] CRM Shortlist for 20-Person Sales Team',
    created_at: mondayIso,
    updated_at: mondayIso,
    is_demo: 1,
  });

  const msgA1Id = randomUUID();
  messageRepo.create({
    id: msgA1Id,
    conversation_id: convAId,
    role: 'user',
    content: 'We are evaluating CRM tools for our 20-person sales team. We want affordable options with strong workflow automation. Can you shortlist the top 5 options and their pricing?',
    created_at: mondayIso,
  });

  const msgA2Id = randomUUID();
  messageRepo.create({
    id: msgA2Id,
    conversation_id: convAId,
    role: 'assistant',
    content: `Here is the shortlist of 5 CRM tools for your 20-person sales team:\n\n1. **HubSpot Sales Hub**: Professional is $100/seat/month billed annually ($120/mo monthly), minimum 5 users. Strongest automation.\n2. **Zoho CRM**: Professional is $23/user/month billed annually ($35/mo monthly). Highly cost-effective.\n3. **Salesforce Sales Cloud**: Enterprise is $165/user/month billed annually.\n4. **Pipedrive**: Advanced plan is $29/user/month billed annually ($39/mo monthly).\n5. **Freshsales**: Pro plan is $39/user/month billed annually.\n\nFor 20 seats, Zoho CRM is the most economical at $460/mo, while HubSpot Professional totals $2,000/mo.`,
    created_at: mondayIso,
  });

  // Events for Scenario A
  eventRepo.create({
    id: randomUUID(),
    user_id: userId,
    conversation_id: convAId,
    source_message_id: msgA1Id,
    event_type: 'SHORTLISTED',
    description: 'Shortlisted 5 CRM options for 20-person team: HubSpot, Zoho CRM, Salesforce, Pipedrive, Freshsales',
    event_time: mondayIso,
    recorded_at: mondayIso,
    confidence: 1.0,
    metadata: { team_size: 20 },
    entities: ['HubSpot', 'Zoho CRM', 'Salesforce', 'Pipedrive', 'Freshsales'],
  }, [hubspot.id, zoho.id, salesforce.id, pipedrive.id, freshsales.id]);

  eventRepo.create({
    id: randomUUID(),
    user_id: userId,
    conversation_id: convAId,
    source_message_id: msgA1Id,
    event_type: 'REQUIREMENT_SPECIFIED',
    description: 'Specified 20-person sales team requirement with workflow automation',
    event_time: mondayIso,
    recorded_at: mondayIso,
    confidence: 1.0,
    metadata: { team_size: 20, feature: 'workflow automation' },
  });

  // Claims for Scenario A
  claimRepo.upsertClaim(
    hubspot.id,
    'pricing_per_seat_annual',
    '$100/seat/month billed annually ($120/mo monthly)',
    { amount: 100, currency: 'USD', billing_period: 'per_seat_annual', tier: 'Professional', seat_count: 20 },
    'VERIFIED',
    mondayIso,
    undefined,
    msgA2Id
  );

  claimRepo.upsertClaim(
    zoho.id,
    'pricing_per_seat_annual',
    '$23/user/month billed annually ($35/mo monthly)',
    { amount: 23, currency: 'USD', billing_period: 'per_seat_annual', tier: 'Professional', seat_count: 20 },
    'VERIFIED',
    mondayIso,
    undefined,
    msgA2Id
  );

  claimRepo.upsertClaim(
    salesforce.id,
    'pricing_per_seat_annual',
    '$165/user/month billed annually',
    { amount: 165, currency: 'USD', billing_period: 'per_seat_annual', tier: 'Enterprise', seat_count: 20 },
    'VERIFIED',
    mondayIso,
    undefined,
    msgA2Id
  );

  claimRepo.upsertClaim(
    pipedrive.id,
    'pricing_per_seat_annual',
    '$29/user/month billed annually ($39/mo monthly)',
    { amount: 29, currency: 'USD', billing_period: 'per_seat_annual', tier: 'Advanced', seat_count: 20 },
    'VERIFIED',
    mondayIso,
    undefined,
    msgA2Id
  );

  claimRepo.upsertClaim(
    freshsales.id,
    'pricing_per_seat_annual',
    '$39/user/month billed annually',
    { amount: 39, currency: 'USD', billing_period: 'per_seat_annual', tier: 'Pro', seat_count: 20 },
    'VERIFIED',
    mondayIso,
    undefined,
    msgA2Id
  );

  memoryRepo.create({
    id: randomUUID(),
    user_id: userId,
    conversation_id: convAId,
    memory_type: 'SUMMARY',
    content: 'Evaluated 5 CRM options for 20-person sales team on Monday: HubSpot ($100/seat/mo annual), Zoho CRM ($23/user/mo annual), Salesforce ($165/user/mo annual), Pipedrive ($29/user/mo annual), Freshsales ($39/user/mo annual)',
    context_date: mondayIso,
    recorded_at: mondayIso,
    status: 'ACTIVE',
  });

  memoryRepo.create({
    id: randomUUID(),
    user_id: userId,
    conversation_id: convAId,
    memory_type: 'REQUIREMENT',
    content: '20-person sales team evaluating workflow automation and per-seat pricing',
    context_date: mondayIso,
    recorded_at: mondayIso,
    status: 'ACTIVE',
  });

  // ==========================================
  // SCENARIO B: 3 November QA Verification
  // ==========================================
  const convBId = 'demo-conv-nov3-qa';
  conversationRepo.create({
    id: convBId,
    user_id: userId,
    title: '[DEMO DATA] Managed Postgres Hosting & Backups (3 Nov)',
    created_at: nov3Iso,
    updated_at: nov3Iso,
    is_demo: 1,
  });

  const msgB1Id = randomUUID();
  messageRepo.create({
    id: msgB1Id,
    conversation_id: convBId,
    role: 'user',
    content: 'What are the best managed PostgreSQL hosting options with automated backups and point-in-time recovery for a high-traffic app, and what do they cost?',
    created_at: nov3Iso,
  });

  const msgB2Id = randomUUID();
  messageRepo.create({
    id: msgB2Id,
    conversation_id: convBId,
    role: 'assistant',
    content: `For high-traffic applications requiring automated backups and point-in-time recovery (PITR), here are the top 3 managed PostgreSQL options:\n\n1. **Neon Serverless Postgres**: The Launch plan costs $19/month, including 10 GB storage and 300 compute hours. The Scale plan at $69/month includes automated PITR up to 30 days.\n2. **Supabase**: The Pro plan is $25/month, including 8GB storage and 7-day point-in-time recovery. Dedicated micro compute instances can be added for $10/month.\n3. **Amazon RDS for PostgreSQL**: A db.t4g.micro instance costs ~$0.016/hour (~$11.68/month) on Linux with automated daily snapshots and 35-day backup retention. Storage is $0.115/GB-month.`,
    created_at: nov3Iso,
  });

  // Events for Scenario B
  eventRepo.create({
    id: randomUUID(),
    user_id: userId,
    conversation_id: convBId,
    source_message_id: msgB1Id,
    event_type: 'DISCUSSED',
    description: 'Evaluated Neon, Supabase, and AWS RDS for managed PostgreSQL hosting with PITR',
    event_time: nov3Iso,
    recorded_at: nov3Iso,
    confidence: 1.0,
    entities: ['Neon', 'Supabase', 'AWS RDS', 'PostgreSQL'],
  }, [neon.id, supabase.id, awsRds.id, postgres.id]);

  // Independent claims for Scenario B
  claimRepo.upsertClaim(
    neon.id,
    'pricing_launch_plan',
    '$19/month',
    { amount: 19, currency: 'USD', billing_period: 'monthly', tier: 'Launch' },
    'VERIFIED',
    nov3Iso,
    undefined,
    msgB2Id
  );
  claimRepo.upsertClaim(
    supabase.id,
    'pricing_pro_plan',
    '$25/month',
    { amount: 25, currency: 'USD', billing_period: 'monthly', tier: 'Pro' },
    'VERIFIED',
    nov3Iso,
    undefined,
    msgB2Id
  );
  claimRepo.upsertClaim(
    awsRds.id,
    'pricing_db_t4g_micro',
    '$11.68/month',
    { amount: 11.68, currency: 'USD', billing_period: 'monthly', tier: 'db.t4g.micro' },
    'VERIFIED',
    nov3Iso,
    undefined,
    msgB2Id
  );

  // ==========================================
  // SCENARIO C: Postgres Hosting Last Tuesday
  // ==========================================
  const convCId = 'demo-conv-postgres-last-tuesday';
  conversationRepo.create({
    id: convCId,
    user_id: userId,
    title: '[DEMO DATA] Postgres Hosting Pricing Review (Last Tuesday)',
    created_at: lastTuesdayIso,
    updated_at: lastTuesdayIso,
    is_demo: 1,
  });

  const msgC1Id = randomUUID();
  messageRepo.create({
    id: msgC1Id,
    conversation_id: convCId,
    role: 'user',
    content: 'Can you compare the pricing for Postgres hosting between Neon, Supabase, and AWS RDS for a standard production setup?',
    created_at: lastTuesdayIso,
  });

  const msgC2Id = randomUUID();
  messageRepo.create({
    id: msgC2Id,
    conversation_id: convCId,
    role: 'assistant',
    content: `Here is the pricing breakdown for managed PostgreSQL hosting:\n- **Neon**: Launch plan is $19/month (monthly billing) with 10 GB storage.\n- **Supabase**: Pro tier is $25/month (monthly billing) with 8 GB database storage.\n- **AWS RDS**: Single-AZ db.t4g.micro is ~$11.68/month ($0.016/hr) plus gp3 storage at $0.115/GB-mo.`,
    created_at: lastTuesdayIso,
  });

  eventRepo.create({
    id: randomUUID(),
    user_id: userId,
    conversation_id: convCId,
    source_message_id: msgC1Id,
    event_type: 'COMPARED',
    description: 'Compared Postgres hosting monthly pricing across Neon ($19), Supabase ($25), and AWS RDS (~$11.68)',
    event_time: lastTuesdayIso,
    recorded_at: lastTuesdayIso,
    confidence: 1.0,
    entities: ['Neon', 'Supabase', 'AWS RDS', 'PostgreSQL'],
  }, [neon.id, supabase.id, awsRds.id, postgres.id]);

  return { conversationAId: convAId, conversationBId: convBId, conversationCId: convCId };
}

// Direct execution CLI support
if (process.argv[1]?.endsWith('seed.ts')) {
  console.log('[Seed] Seeding demo benchmark scenarios...');
  const db = getDatabase();
  const ids = seedDemoData(db);
  console.log('[Seed] Seeded successfully:', ids);
}

