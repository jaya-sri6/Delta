// DELTA Core Type Definitions

export type IntentType =
  | 'GENERAL_CHAT'
  | 'HISTORICAL_RECALL'
  | 'CURRENT_RESEARCH'
  | 'CHANGE_DETECTION'
  | 'ANSWER_VERIFICATION'
  | 'FOLLOW_UP'
  | 'AMBIGUOUS';

export type EventType =
  | 'DISCUSSED'
  | 'SHORTLISTED'
  | 'COMPARED'
  | 'SELECTED'
  | 'REJECTED'
  | 'DECIDED'
  | 'UPDATED'
  | 'SUPERSEDED'
  | 'REQUIREMENT_SPECIFIED'
  | 'PREFERENCE_SPECIFIED';

export type EventRelationshipType =
  | 'supersedes'
  | 'updates'
  | 'depends_on'
  | 'relates_to';

export type MemoryType =
  | 'DECISION'
  | 'PREFERENCE'
  | 'REQUIREMENT'
  | 'FACT'
  | 'SUMMARY';

export type ClaimVerificationStatus =
  | 'VERIFIED'
  | 'CHANGED'
  | 'UNCHANGED'
  | 'UNVERIFIED'
  | 'CONFLICTING'
  | 'NOT_CHECKED'
  | 'PARTIALLY_VERIFIED'
  | 'OUTDATED'
  | 'CONTRADICTED'
  | 'UNRESOLVED'
  | 'INCOMPARABLE'
  | 'UNKNOWN'
  | 'NOT_APPLICABLE';

export type ComparisonStatus =
  | 'VERIFIED'
  | 'CHANGED'
  | 'UNCHANGED'
  | 'UNVERIFIED'
  | 'CONFLICTING'
  | 'NOT_CHECKED'
  | 'PARTIALLY_VERIFIED'
  | 'UNRESOLVED'
  | 'INCOMPARABLE'
  | 'INCREASED'
  | 'DECREASED'
  | 'ADDED'
  | 'REMOVED'
  | 'CONTRADICTED'
  | 'UNKNOWN'
  | 'INCOMPARABLE_BILLING_CYCLE'
  | 'FEATURE_RELEASED'
  | 'EXISTING_FEATURE_CONFIRMED';

export type EvidenceType =
  | 'OFFICIAL_PRICING'
  | 'OFFICIAL_DOCUMENTATION'
  | 'OFFICIAL_RELEASE_NOTES'
  | 'OFFICIAL_ANNOUNCEMENT'
  | 'THIRD_PARTY_RESEARCH'
  | 'COMMUNITY_DISCUSSION'
  | 'UNKNOWN';

export type CredibilityCategory =
  | 'PRIMARY_OFFICIAL'
  | 'SECONDARY_RELIABLE'
  | 'UNVERIFIED';

export interface User {
  id: string;
  name: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  is_demo?: number;
}

export interface ActivityStep {
  step: string;
  details?: string;
  timestamp: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  activity_log?: ActivityStep[] | string;
  research_session_id?: string;
  token_count?: number;
}

export interface Entity {
  id: string;
  canonical_name: string;
  entity_type: string;
  first_mentioned_at: string;
  last_mentioned_at: string;
  metadata?: any;
}

export interface EntityAlias {
  id: string;
  entity_id: string;
  alias: string;
  is_canonical: number;
  created_at: string;
}

export interface MemoryEvent {
  id: string;
  user_id: string;
  conversation_id: string;
  source_message_id?: string;
  event_type: EventType;
  description: string;
  event_time: string; // when event actually happened
  recorded_at: string; // when DELTA learned about it
  confidence: number;
  metadata?: any;
  entities?: string[]; // canonical names or entity IDs
}

export interface StructuredMemory {
  id: string;
  user_id: string;
  conversation_id: string;
  memory_type: MemoryType;
  content: string;
  context_date: string;
  recorded_at: string;
  status: 'ACTIVE' | 'SUPERSEDED' | 'ARCHIVED';
  metadata?: any;
}

export interface NormalizedPrice {
  amount: number;
  currency: string;
  billing_period: 'monthly' | 'annually' | 'per_seat_monthly' | 'per_seat_annual' | 'usage';
  seat_count?: number;
  tier_name?: string;
  notes?: string;
}

export interface Claim {
  id: string;
  subject_entity_id: string;
  predicate: string;
  current_value: string;
  normalized_value?: NormalizedPrice | any;
  verification_status: ClaimVerificationStatus;
  first_observed_at: string;
  last_verified_at: string;
  valid_from?: string;
  valid_until?: string;
  confidence: number;
  created_at: string;
  updated_at: string;
}

export interface ClaimVersion {
  id: string;
  claim_id: string;
  value: string;
  normalized_value?: any;
  verification_status: ClaimVerificationStatus;
  observed_at: string;
  source_evidence_id?: string;
  original_message_id?: string;
  change_reason?: string;
  created_at: string;
}

export interface Evidence {
  id: string;
  research_session_id?: string;
  entity_id?: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  publication_date?: string;
  event_date?: string;
  retrieved_at: string;
  evidence_type: EvidenceType;
  credibility_category: CredibilityCategory;
  score?: number;
}

export interface TemporalResolution {
  original_expression: string;
  resolved_start: string | null;
  resolved_end: string | null;
  timezone: string;
  reference_timestamp: string;
  resolution_method: string;
  confidence: number;
}

export interface SearchQueryPlan {
  query: string;
  target_entity?: string;
  topic: 'general' | 'news';
  search_depth: 'basic' | 'advanced';
  time_range?: string;
}

export interface ResearchPlan {
  intent: IntentType;
  target_entities: string[];
  historical_context_required: boolean;
  date_range: {
    start?: string;
    end?: string;
    description?: string;
  } | null;
  claims_to_verify: string[];
  search_required: boolean;
  search_queries: SearchQueryPlan[];
  expected_evidence: string[];
  maximum_search_calls: number;
}

export interface ComparisonResult {
  claim_id?: string;
  entity: string;
  predicate: string;
  status: ComparisonStatus;
  historical_value: string;
  historical_date?: string;
  current_value: string;
  current_observation_date?: string;
  billing_cycle?: string;
  billing_frequency?: 'annual' | 'monthly' | 'usage';
  plan_name?: string;
  supporting_source_ids?: string[];
  source_domain?: string;
  evidence_excerpt?: string;
  verification_status?: ComparisonStatus | ClaimVerificationStatus;
  verification_reason?: string;
  difference: string | null;
  percentage_difference: number | null;
  evidence_ids: string[];
  evidence_urls: string[];
  confidence: number;
  explanation: string;
  change_date?: string;
  team_size?: number;
  monthly_team_total?: number;
  annual_team_total?: number;
  feature_status?: 'ANNOUNCED' | 'BETA' | 'GENERALLY_AVAILABLE';
}

export interface ExecutedQueryInfo {
  query: string;
  target_entity?: string;
  status: 'SUCCESS' | 'EMPTY' | 'FAILED' | 'NO_API_KEY';
  results_count: number;
  duration_ms: number;
  error?: string;
}

export interface RejectedSourceInfo {
  url: string;
  domain: string;
  title?: string;
  reason: string;
}

export interface TopicResearchStatus {
  id: string;
  title: string;
  domain: string;
  query: string;
  conversation_title?: string;
  conversation_date?: string;
  entities: string[];
  claims_count: number;
  events_count: number;
  search_required: boolean;
  search_status: 'RECALLED_FROM_MEMORY' | 'SEARCHED' | 'NO_MEMORY_FOUND';
}

export interface ResearchActivitySummary {
  historical_events_retrieved: number;
  historical_baseline_date?: string;
  historical_baseline_source?: string;
  relevant_entities: string[];
  researched_entities: string[];
  unresearched_entities: string[];
  planned_queries_count: number;
  executed_queries_count: number;
  successful_queries_count: number;
  failed_queries_count: number;
  queries: ExecutedQueryInfo[];
  search_queries_performed: string[]; // For backwards-compatibility
  sources_collected: number;
  sources_retrieved_count?: number;
  sources_accepted_count?: number;
  sources_rejected_count?: number;
  rejected_sources?: RejectedSourceInfo[];
  claims_verified: number;
  changes_detected: number;
  unverified_count: number;
  search_status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'INSUFFICIENT_EVIDENCE' | 'NOT_REQUIRED';
  search_error_message?: string;
  topics?: TopicResearchStatus[];
}

