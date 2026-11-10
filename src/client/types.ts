export interface ConversationItem {
  id: string;
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

export interface InlineCitation {
  index: number;
  id: string;
  url: string;
  title: string;
  domain: string;
  evidence_type: string;
  credibility_category: string;
}

export interface ComparisonResult {
  entity: string;
  predicate: string;
  status:
    | 'VERIFIED'
    | 'PARTIALLY_VERIFIED'
    | 'UNRESOLVED'
    | 'INCOMPARABLE'
    | 'INCREASED'
    | 'DECREASED'
    | 'ADDED'
    | 'REMOVED'
    | 'UNCHANGED'
    | 'CONTRADICTED'
    | 'UNVERIFIED'
    | 'UNKNOWN'
    | 'INCOMPARABLE_BILLING_CYCLE'
    | 'FEATURE_RELEASED'
    | 'EXISTING_FEATURE_CONFIRMED';
  historical_value: string;
  current_value: string;
  difference: string | null;
  percentage_difference: number | null;
  evidence_ids: string[];
  evidence_urls: string[];
  confidence: number;
  explanation: string;
  change_date?: string;
  historical_date?: string;
  billing_frequency?: 'annual' | 'monthly' | 'usage';
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
  researched_entities?: string[];
  unresearched_entities?: string[];
  planned_queries_count?: number;
  executed_queries_count?: number;
  successful_queries_count?: number;
  failed_queries_count?: number;
  queries?: ExecutedQueryInfo[];
  search_queries_performed: string[];
  sources_collected: number;
  sources_retrieved_count?: number;
  sources_accepted_count?: number;
  sources_rejected_count?: number;
  rejected_sources?: RejectedSourceInfo[];
  claims_verified: number;
  changes_detected: number;
  unverified_count: number;
  search_status?: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'INSUFFICIENT_EVIDENCE' | 'NOT_REQUIRED';
  search_error_message?: string;
  topics?: TopicResearchStatus[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  activity_log?: ActivityStep[];
  citations?: InlineCitation[];
  comparisons?: ComparisonResult[];
  activity_summary?: ResearchActivitySummary;
  isStreaming?: boolean;
}

