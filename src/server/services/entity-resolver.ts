import { EntityRepo } from '../db/repositories/entity.repo.js';
import { Entity } from '../types/index.js';

export interface KnownEntityMapping {
  canonicalName: string;
  type: string;
  domain: 'DATABASE_HOSTING' | 'CRM' | 'GENERAL';
  aliases: string[];
}

export const SEED_KNOWN_ENTITIES: KnownEntityMapping[] = [
  {
    canonicalName: 'PostgreSQL',
    type: 'TECHNOLOGY',
    domain: 'DATABASE_HOSTING',
    aliases: ['postgres', 'postgresql', 'pgsql', 'psql'],
  },
  {
    canonicalName: 'Supabase',
    type: 'PRODUCT',
    domain: 'DATABASE_HOSTING',
    aliases: ['supabase', 'supabase db'],
  },
  {
    canonicalName: 'Neon',
    type: 'PRODUCT',
    domain: 'DATABASE_HOSTING',
    aliases: ['neon', 'neon tech', 'neon postgres', 'neon serverless'],
  },
  {
    canonicalName: 'AWS RDS',
    type: 'PRODUCT',
    domain: 'DATABASE_HOSTING',
    aliases: ['aws rds', 'amazon rds', 'rds', 'aws rds postgres', 'amazon relational database service'],
  },
  {
    canonicalName: 'DigitalOcean Managed Databases',
    type: 'PRODUCT',
    domain: 'DATABASE_HOSTING',
    aliases: ['digitalocean', 'digitalocean postgres', 'do postgres', 'digital ocean'],
  },
  {
    canonicalName: 'HubSpot',
    type: 'PRODUCT',
    domain: 'CRM',
    aliases: ['hubspot', 'hubspot crm', 'hub spot'],
  },
  {
    canonicalName: 'Zoho CRM',
    type: 'PRODUCT',
    domain: 'CRM',
    aliases: ['zoho', 'zoho crm'],
  },
  {
    canonicalName: 'Salesforce',
    type: 'PRODUCT',
    domain: 'CRM',
    aliases: ['salesforce', 'salesforce crm', 'sfdc', 'sales cloud'],
  },
  {
    canonicalName: 'Pipedrive',
    type: 'PRODUCT',
    domain: 'CRM',
    aliases: ['pipedrive', 'pipedrive crm'],
  },
  {
    canonicalName: 'Freshsales',
    type: 'PRODUCT',
    domain: 'CRM',
    aliases: ['freshsales', 'freshworks', 'freshsales crm'],
  },
  {
    canonicalName: 'Railway',
    type: 'PRODUCT',
    domain: 'DATABASE_HOSTING',
    aliases: ['railway', 'railway app', 'railway postgres'],
  },
  {
    canonicalName: 'Fly.io',
    type: 'PRODUCT',
    domain: 'DATABASE_HOSTING',
    aliases: ['fly.io', 'fly postgres', 'fly io'],
  },
];

export function getEntityDomain(canonicalName: string): 'DATABASE_HOSTING' | 'CRM' | 'GENERAL' {
  const mapping = SEED_KNOWN_ENTITIES.find(e => e.canonicalName.toLowerCase() === canonicalName.toLowerCase());
  return mapping ? mapping.domain : 'GENERAL';
}

export function detectQueryDomain(text: string): 'DATABASE_HOSTING' | 'CRM' | 'GENERAL' {
  const lower = text.toLowerCase();

  const isDb = /\b(postgres|postgresql|database|databases|hosting|neon|supabase|rds|sql|pitr|backups?)\b/i.test(lower);
  const isCrm = /\b(crm|sales\s+team|salesforce|hubspot|zoho|pipedrive|freshsales|leads?|pipeline)\b/i.test(lower);

  if (isDb && !isCrm) return 'DATABASE_HOSTING';
  if (isCrm && !isDb) return 'CRM';
  if (isDb && isCrm) {
    // Both domains are present in this text; do not penalize either
    return 'GENERAL';
  }

  return 'GENERAL';
}

export class EntityResolver {
  constructor(private entityRepo: EntityRepo) {
    this.seedDefaults();
  }

  private seedDefaults(): void {
    for (const item of SEED_KNOWN_ENTITIES) {
      const ent = this.entityRepo.findOrCreate(item.canonicalName, item.type);
      for (const alias of item.aliases) {
        this.entityRepo.addAlias(ent.id, alias);
      }
    }
  }

  /**
   * Resolves a raw name or alias to its canonical Entity.
   */
  resolve(rawName: string): Entity | undefined {
    const clean = rawName.trim();
    if (!clean) return undefined;

    // 1. Direct match by alias or canonical name in repository
    const byAlias = this.entityRepo.findByAlias(clean);
    if (byAlias) return byAlias;

    const byCanonical = this.entityRepo.findByCanonicalName(clean);
    if (byCanonical) return byCanonical;

    return undefined;
  }

  /**
   * Identifies all mentioned known entities within a text snippet.
   */
  extractEntitiesFromText(text: string): Entity[] {
    const textLower = text.toLowerCase();
    const matched: Map<string, Entity> = new Map();

    const allEntities = this.entityRepo.listAll();
    for (const entity of allEntities) {
      // Check canonical name
      const canonPattern = new RegExp(`\\b${this.escapeRegExp(entity.canonical_name.toLowerCase())}\\b`, 'i');
      if (canonPattern.test(textLower)) {
        matched.set(entity.id, entity);
        continue;
      }
    }

    // Check seed dictionary aliases for any remaining
    for (const item of SEED_KNOWN_ENTITIES) {
      for (const alias of item.aliases) {
        // Skip very short aliases like 'do' if they could match common English words
        if (alias.length <= 2) continue;
        const pattern = new RegExp(`\\b${this.escapeRegExp(alias)}\\b`, 'i');
        if (pattern.test(textLower)) {
          const resolved = this.resolve(alias);
          if (resolved) {
            matched.set(resolved.id, resolved);
          }
          break;
        }
      }
    }

    return Array.from(matched.values());
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

