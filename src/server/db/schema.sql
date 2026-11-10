-- DELTA SQLite Database Schema
-- Supports event-based memory, claim-level knowledge, temporal tracking, and full-text search

PRAGMA foreign_keys = ON;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  activity_log TEXT,
  research_session_id TEXT,
  token_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

-- Entities
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL,
  first_mentioned_at TEXT NOT NULL,
  last_mentioned_at TEXT NOT NULL,
  metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_entities_canonical ON entities(canonical_name);

-- Entity Aliases
CREATE TABLE IF NOT EXISTS entity_aliases (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  alias TEXT NOT NULL UNIQUE,
  is_canonical INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_alias ON entity_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_entity ON entity_aliases(entity_id);

-- Events
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  event_time TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_conversation ON events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_events_time ON events(event_time);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);

-- Event Entities Link
CREATE TABLE IF NOT EXISTS event_entities (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, entity_id)
);

-- Event Relationships
CREATE TABLE IF NOT EXISTS event_relationships (
  id TEXT PRIMARY KEY,
  source_event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  target_event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_rel_source ON event_relationships(source_event_id);
CREATE INDEX IF NOT EXISTS idx_event_rel_target ON event_relationships(target_event_id);

-- Structured Memories
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL,
  content TEXT NOT NULL,
  context_date TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_conv ON memories(conversation_id);
CREATE INDEX IF NOT EXISTS idx_memories_date ON memories(context_date);

-- Research Sessions
CREATE TABLE IF NOT EXISTS research_sessions (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  intent TEXT NOT NULL,
  plan TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_research_sessions_conv ON research_sessions(conversation_id);

-- Research Queries
CREATE TABLE IF NOT EXISTS research_queries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES research_sessions(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT 'general',
  search_depth TEXT NOT NULL DEFAULT 'basic',
  results_count INTEGER NOT NULL DEFAULT 0,
  executed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_research_queries_session ON research_queries(session_id);

-- Evidence
CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  research_session_id TEXT REFERENCES research_sessions(id) ON DELETE SET NULL,
  entity_id TEXT REFERENCES entities(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  snippet TEXT NOT NULL,
  publication_date TEXT,
  event_date TEXT,
  retrieved_at TEXT NOT NULL,
  evidence_type TEXT NOT NULL DEFAULT 'UNKNOWN',
  credibility_category TEXT NOT NULL DEFAULT 'UNKNOWN',
  score REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_evidence_url ON evidence(url);
CREATE INDEX IF NOT EXISTS idx_evidence_entity ON evidence(entity_id);
CREATE INDEX IF NOT EXISTS idx_evidence_session ON evidence(research_session_id);

-- Claims
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  subject_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  predicate TEXT NOT NULL,
  current_value TEXT NOT NULL,
  normalized_value TEXT,
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  first_observed_at TEXT NOT NULL,
  last_verified_at TEXT NOT NULL,
  valid_from TEXT,
  valid_until TEXT,
  confidence REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_claims_entity ON claims(subject_entity_id);
CREATE INDEX IF NOT EXISTS idx_claims_predicate ON claims(predicate);

-- Claim Versions (Immutable Historical Audits)
CREATE TABLE IF NOT EXISTS claim_versions (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  normalized_value TEXT,
  verification_status TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  source_evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  original_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  change_reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_claim_versions_claim ON claim_versions(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_versions_observed ON claim_versions(observed_at);

-- Message Claims Link
CREATE TABLE IF NOT EXISTS message_claims (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  PRIMARY KEY (message_id, claim_id)
);

-- Full-Text Search (FTS5) Tables
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  id UNINDEXED,
  content
);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  id UNINDEXED,
  content
);

CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
  id UNINDEXED,
  description
);

