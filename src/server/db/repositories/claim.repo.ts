import { DeltaDatabase } from '../database.js';
import { Claim, ClaimVersion, ClaimVerificationStatus } from '../../types/index.js';
import { randomUUID } from 'crypto';

export class ClaimRepo {
  constructor(private db: DeltaDatabase) {}

  upsertClaim(
    entityId: string,
    predicate: string,
    value: string,
    normalizedValue: any,
    status: ClaimVerificationStatus,
    observedAt: string,
    evidenceId?: string,
    messageId?: string,
    changeReason?: string
  ): { claim: Claim; version: ClaimVersion } {
    const existing = this.findByEntityAndPredicate(entityId, predicate);
    const now = new Date().toISOString();
    const normStr = normalizedValue ? JSON.stringify(normalizedValue) : null;

    let claimId: string;
    let claim: Claim;

    if (existing) {
      claimId = existing.id;
      // Update claim head record
      this.db.prepare(`
        UPDATE claims
        SET current_value = ?,
            normalized_value = ?,
            verification_status = ?,
            last_verified_at = ?,
            updated_at = ?
        WHERE id = ?
      `).run(value, normStr, status, observedAt, now, claimId);

      claim = {
        ...existing,
        current_value: value,
        normalized_value: normalizedValue,
        verification_status: status,
        last_verified_at: observedAt,
        updated_at: now,
      };
    } else {
      claimId = randomUUID();
      this.db.prepare(`
        INSERT INTO claims (
          id, subject_entity_id, predicate, current_value, normalized_value,
          verification_status, first_observed_at, last_verified_at, confidence, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1.0, ?, ?)
      `).run(claimId, entityId, predicate, value, normStr, status, observedAt, observedAt, now, now);

      claim = {
        id: claimId,
        subject_entity_id: entityId,
        predicate,
        current_value: value,
        normalized_value: normalizedValue,
        verification_status: status,
        first_observed_at: observedAt,
        last_verified_at: observedAt,
        confidence: 1.0,
        created_at: now,
        updated_at: now,
      };
    }

    // Always create an immutable claim version record
    const versionId = randomUUID();
    this.db.prepare(`
      INSERT INTO claim_versions (
        id, claim_id, value, normalized_value, verification_status,
        observed_at, source_evidence_id, original_message_id, change_reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      versionId,
      claimId,
      value,
      normStr,
      status,
      observedAt,
      evidenceId || null,
      messageId || null,
      changeReason || null,
      now
    );

    const version: ClaimVersion = {
      id: versionId,
      claim_id: claimId,
      value,
      normalized_value: normalizedValue,
      verification_status: status,
      observed_at: observedAt,
      source_evidence_id: evidenceId,
      original_message_id: messageId,
      change_reason: changeReason,
      created_at: now,
    };

    if (messageId) {
      this.linkMessageClaim(messageId, claimId, evidenceId);
    }

    return { claim, version };
  }

  findByEntityAndPredicate(entityId: string, predicate: string): Claim | undefined {
    const row = this.db.prepare<any>(`
      SELECT * FROM claims
      WHERE subject_entity_id = ? AND predicate = ?
    `).get(entityId, predicate);

    if (!row) return undefined;
    return {
      ...row,
      normalized_value: row.normalized_value ? JSON.parse(row.normalized_value) : undefined,
    };
  }

  getClaimsByEntity(entityId: string): Claim[] {
    const rows = this.db.prepare<any>(`
      SELECT * FROM claims
      WHERE subject_entity_id = ?
      ORDER BY updated_at DESC
    `).all(entityId);

    return rows.map(r => ({
      ...r,
      normalized_value: r.normalized_value ? JSON.parse(r.normalized_value) : undefined,
    }));
  }

  getClaimVersions(claimId: string): ClaimVersion[] {
    const rows = this.db.prepare<any>(`
      SELECT * FROM claim_versions
      WHERE claim_id = ?
      ORDER BY observed_at ASC
    `).all(claimId);

    return rows.map(r => ({
      ...r,
      normalized_value: r.normalized_value ? JSON.parse(r.normalized_value) : undefined,
    }));
  }

  getAllClaims(): Claim[] {
    const rows = this.db.prepare<any>(`
      SELECT * FROM claims
      ORDER BY updated_at DESC
    `).all();

    return rows.map(r => ({
      ...r,
      normalized_value: r.normalized_value ? JSON.parse(r.normalized_value) : undefined,
    }));
  }

  linkMessageClaim(messageId: string, claimId: string, evidenceId?: string): void {
    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO message_claims (message_id, claim_id, evidence_id)
        VALUES (?, ?, ?)
      `).run(messageId, claimId, evidenceId || null);
    } catch {
      // Ignore if already linked
    }
  }

  getClaimsForMessage(messageId: string): Claim[] {
    const rows = this.db.prepare<any>(`
      SELECT c.*
      FROM claims c
      JOIN message_claims mc ON c.id = mc.claim_id
      WHERE mc.message_id = ?
    `).all(messageId);

    return rows.map(r => ({
      ...r,
      normalized_value: r.normalized_value ? JSON.parse(r.normalized_value) : undefined,
    }));
  }
}

