import { randomUUID } from 'crypto';
import { DeltaDatabase } from '../db/database.js';
import { ConversationRepo, MessageRepo } from '../db/repositories/conversation.repo.js';
import { EntityRepo } from '../db/repositories/entity.repo.js';
import { EventRepo } from '../db/repositories/event.repo.js';
import { MemoryRepo } from '../db/repositories/memory.repo.js';
import { ClaimRepo } from '../db/repositories/claim.repo.js';
import { EvidenceRepo } from '../db/repositories/evidence.repo.js';
import { IntentClassifier } from './intent-classifier.js';
import { TemporalResolver } from './temporal-resolver.js';
import { EntityResolver } from './entity-resolver.js';
import { MemoryRetrievalEngine } from './memory-retrieval.js';
import { ResearchPlanner } from './research-planner.js';
import { WebSearchService, validateExternalUrl, SearchExecutionResult } from './web-search.js';
import { TemporalComparisonEngine } from './temporal-comparison.js';
import { CitationValidator, InlineCitation } from './citation-validator.js';
import { AnswerSynthesizer, SynthesizerSubTopic } from './answer-synthesizer.js';
import { EventExtractionEngine } from './event-extractor.js';
import {
  Message,
  ActivityStep,
  ComparisonResult,
  Evidence,
  ResearchActivitySummary,
  ExecutedQueryInfo,
  TopicResearchStatus,
} from '../types/index.js';

export interface OrchestrationResult {
  message: Message;
  activity_log: ActivityStep[];
  citations: InlineCitation[];
  comparisons: ComparisonResult[];
  activity_summary: ResearchActivitySummary;
  latencies: {
    intent_ms: number;
    retrieval_ms: number;
    search_ms: number;
    comparison_ms: number;
    synthesis_ms: number;
    total_ms: number;
  };
}

export type StreamCallback = (eventType: string, data: any) => void;

export class AgentOrchestrator {
  private conversationRepo: ConversationRepo;
  private messageRepo: MessageRepo;
  private entityRepo: EntityRepo;
  private eventRepo: EventRepo;
  private memoryRepo: MemoryRepo;
  private claimRepo: ClaimRepo;
  private evidenceRepo: EvidenceRepo;

  private intentClassifier: IntentClassifier;
  private temporalResolver: TemporalResolver;
  private entityResolver: EntityResolver;
  private memoryRetrieval: MemoryRetrievalEngine;
  private researchPlanner: ResearchPlanner;
  private webSearch: WebSearchService;
  private comparisonEngine: TemporalComparisonEngine;
  private citationValidator: CitationValidator;
  private synthesizer: AnswerSynthesizer;
  private eventExtractor: EventExtractionEngine;

  constructor(
    private db: DeltaDatabase,
    openaiApiKey?: string,
    openaiModel: string = 'gpt-4o',
    tavilyApiKey?: string,
    userTimezone: string = 'Asia/Kolkata',
    webSearchService?: WebSearchService
  ) {
    this.conversationRepo = new ConversationRepo(db);
    this.messageRepo = new MessageRepo(db);
    this.entityRepo = new EntityRepo(db);
    this.eventRepo = new EventRepo(db);
    this.memoryRepo = new MemoryRepo(db);
    this.claimRepo = new ClaimRepo(db);
    this.evidenceRepo = new EvidenceRepo(db);

    this.intentClassifier = new IntentClassifier();
    this.temporalResolver = new TemporalResolver(undefined, userTimezone);
    this.entityResolver = new EntityResolver(this.entityRepo);
    this.memoryRetrieval = new MemoryRetrievalEngine(
      this.conversationRepo,
      this.messageRepo,
      this.eventRepo,
      this.memoryRepo,
      this.claimRepo,
      this.entityRepo
    );
    this.researchPlanner = new ResearchPlanner(5);
    this.webSearch = webSearchService || new WebSearchService({ apiKey: tavilyApiKey });
    this.comparisonEngine = new TemporalComparisonEngine();
    this.citationValidator = new CitationValidator();
    this.synthesizer = new AnswerSynthesizer(openaiApiKey, openaiModel);
    this.eventExtractor = new EventExtractionEngine(this.entityResolver);
  }

  /**
   * Complete 16-step agent lifecycle orchestration
   */
  async process(options: {
    userId: string;
    conversationId: string;
    userMessage: string;
    onStream?: StreamCallback;
    signal?: AbortSignal;
  }): Promise<OrchestrationResult> {
    const totalStart = Date.now();
    const activityLog: ActivityStep[] = [];
    const pushActivity = (step: string, details?: string) => {
      const item: ActivityStep = { step, details, timestamp: new Date().toISOString() };
      activityLog.push(item);
      if (options.onStream) {
        options.onStream('activity', item);
      }
    };

    // 1. Receive user message
    pushActivity('Receiving user request', options.userMessage);

    // 2. Persist incoming message
    const userMessageId = randomUUID();
    const incomingMessage: Message = {
      id: userMessageId,
      conversation_id: options.conversationId,
      role: 'user',
      content: options.userMessage,
      created_at: new Date().toISOString(),
    };
    this.messageRepo.create(incomingMessage);

    if (options.onStream) {
      options.onStream('message_started', {
        message_id: userMessageId,
        conversation_id: options.conversationId,
      });
    }

    // 3. Identify intent & check for multi-topic requests
    const t0 = Date.now();
    const history = this.messageRepo.getByConversation(options.conversationId);
    const classification = this.intentClassifier.classify(options.userMessage, history.length > 1);
    const subtopics = this.intentClassifier.decomposeIntoTopics(options.userMessage, history.length > 1);
    const isMultiTopic = subtopics.length > 1;
    const intent_ms = Date.now() - t0;
    pushActivity('Classified intent', `${classification.intent} (${Math.round(classification.confidence * 100)}% confidence)`);

    // 4. Resolve temporal references
    const temporalExpressions = this.temporalResolver.extractTemporalExpressions(options.userMessage);
    const primaryExpr = temporalExpressions[0] || 'recently';
    const temporal = this.temporalResolver.resolve(primaryExpr);
    if (temporal.resolved_start) {
      pushActivity('Resolved temporal anchor', `${primaryExpr} -> ${new Date(temporal.resolved_start).toLocaleDateString()}`);
    }

    let retrieval_ms = 0;
    let search_ms = 0;
    let comparison_ms = 0;
    let context: any;
    let plan: any;
    let sessionId: string = randomUUID();
    const collectedEvidence: Evidence[] = [];
    const executedQueries: ExecutedQueryInfo[] = [];
    const allRejectedSources: { url: string; domain: string; title?: string; reason: string }[] = [];
    const researchedEntities = new Set<string>();
    const unresearchedEntities = new Set<string>();
    const comparisons: ComparisonResult[] = [];
    let searchStatus: ResearchActivitySummary['search_status'] = 'NOT_REQUIRED';
    let searchErrorMessage: string | undefined;
    let baselineDate: string | undefined;
    let baselineSource: string | undefined;
    let synthesizerSubtopics: SynthesizerSubTopic[] | undefined;
    let topicResearchStatuses: TopicResearchStatus[] | undefined;

    if (isMultiTopic) {
      pushActivity(
        'Multi-topic intent detected',
        `Decomposed request into ${subtopics.length} isolated research topics: ${subtopics.map(t => t.topicTitle).join(', ')}`
      );

      synthesizerSubtopics = [];
      topicResearchStatuses = [];
      const tMultiRetrieval = Date.now();
      const allTargetEntitiesList: string[] = [];

      for (const sub of subtopics) {
        const subTemporalExprs = this.temporalResolver.extractTemporalExpressions(sub.query);
        const subPrimaryExpr = subTemporalExprs[0] || primaryExpr;
        const subTemporal = this.temporalResolver.resolve(subPrimaryExpr);

        const subContext = this.memoryRetrieval.retrieve({
          userId: options.userId,
          conversationId: options.conversationId,
          timeStart: subTemporal.resolved_start,
          timeEnd: subTemporal.resolved_end,
          query: sub.query,
          targetDomain: sub.domain,
        });

        const subPlan = this.researchPlanner.createPlan(
          sub.query,
          {
            intent: sub.intent,
            confidence: sub.confidence,
            reason: '',
            hasTemporalReference: sub.hasTemporalReference,
            hasComparisonCue: sub.hasComparisonCue,
            hasVerificationCue: sub.hasVerificationCue,
          },
          subTemporal,
          subContext
        );

        if (sub.intent === 'HISTORICAL_RECALL') {
          subPlan.search_required = false;
          subPlan.search_queries = [];
        }

        subPlan.target_entities.forEach(e => {
          if (!allTargetEntitiesList.includes(e)) allTargetEntitiesList.push(e);
          unresearchedEntities.add(e);
        });

        const subEvidence: Evidence[] = [];
        const subExecutedQueries: ExecutedQueryInfo[] = [];
        const subResearchedEntities = new Set<string>();

        if (subPlan.search_required && subPlan.search_queries.length > 0) {
          const tSearchStart = Date.now();
          const subSessionId = this.evidenceRepo.createSession(options.conversationId, subPlan.intent, subPlan);

          const concurrency = 3;
          for (let i = 0; i < subPlan.search_queries.length; i += concurrency) {
            if (options.signal?.aborted) break;
            const chunk = subPlan.search_queries.slice(i, i + concurrency);
            const settledResults = await Promise.allSettled(
              chunk.map(q => this.webSearch.searchDetailed(q, options.signal))
            );

            for (let j = 0; j < chunk.length; j++) {
              const q = chunk[j];
              const settled = settledResults[j];
              const searchRes: SearchExecutionResult = settled.status === 'fulfilled'
                ? settled.value
                : {
                    query: q.query,
                    target_entity: q.target_entity,
                    status: 'FAILED',
                    results: [],
                    total_found: 0,
                    valid_count: 0,
                    rejected_count: 0,
                    duration_ms: 0,
                    error: (settled.reason as Error)?.message || 'Search execution failed unexpectedly',
                  };

              const eqInfo: ExecutedQueryInfo = {
                query: q.query,
                target_entity: q.target_entity,
                status: searchRes.status,
                results_count: searchRes.valid_count,
                duration_ms: searchRes.duration_ms,
                error: searchRes.error,
              };
              subExecutedQueries.push(eqInfo);
              executedQueries.push(eqInfo);

              if (searchRes.rejected_sources) {
                allRejectedSources.push(...searchRes.rejected_sources);
              }

              this.evidenceRepo.recordQuery(
                subSessionId,
                q.query,
                q.topic,
                q.search_depth,
                searchRes.valid_count
              );

              if (searchRes.status === 'SUCCESS' && searchRes.results.length > 0) {
                if (q.target_entity) {
                  subResearchedEntities.add(q.target_entity);
                  researchedEntities.add(q.target_entity);
                  unresearchedEntities.delete(q.target_entity);
                }

                for (const res of searchRes.results) {
                  const urlValidation = validateExternalUrl(res.url);
                  if (!urlValidation.isValid) continue;

                  const evRecord: Evidence = {
                    id: randomUUID(),
                    research_session_id: subSessionId,
                    title: res.title,
                    url: res.url,
                    domain: res.domain,
                    snippet: res.snippet,
                    publication_date: res.published_at,
                    retrieved_at: res.retrieved_at,
                    evidence_type: res.evidence_type,
                    credibility_category: res.credibility_category,
                    score: res.score,
                  };
                  const saved = this.evidenceRepo.saveEvidence(evRecord);
                  subEvidence.push(saved);
                  collectedEvidence.push(saved);
                }
              }
            }
          }
          search_ms += Date.now() - tSearchStart;
        }

        // Comparisons for subtopic
        const subComparisons: ComparisonResult[] = [];
        const subBaselineDate = subContext.events[0]?.event_time || subTemporal.resolved_start || undefined;

        if (subPlan.target_entities.length > 0) {
          const tCompStart = Date.now();
          for (const entityName of subPlan.target_entities) {
            const ent = this.entityRepo.findByAlias(entityName) || this.entityRepo.findByCanonicalName(entityName);
            const entityEvidence = subEvidence.filter(e =>
              e.snippet.toLowerCase().includes(entityName.toLowerCase()) ||
              e.title.toLowerCase().includes(entityName.toLowerCase())
            );

            const existingClaims = ent ? this.claimRepo.getClaimsByEntity(ent.id) : [];
            if (existingClaims.length > 0) {
              for (const claim of existingClaims) {
                const cmp = this.comparisonEngine.compare(
                  claim,
                  entityEvidence,
                  entityName,
                  claim.predicate,
                  { teamSize: 20, baselineDate: subBaselineDate }
                );
                subComparisons.push(cmp);
                comparisons.push(cmp);
              }
            } else {
              const ctxClaim = subContext.claims.find(c => c.subject_entity_id === ent?.id);
              const cmp = this.comparisonEngine.compare(
                ctxClaim || null,
                entityEvidence,
                entityName,
                'pricing',
                { teamSize: 20, baselineDate: subBaselineDate }
              );
              subComparisons.push(cmp);
              comparisons.push(cmp);
            }
          }
          comparison_ms += Date.now() - tCompStart;
        }

        const subCitations: InlineCitation[] = subEvidence.slice(0, 10).map((ev, idx) => ({
          index: idx + 1,
          id: ev.id,
          url: ev.url,
          title: ev.title,
          domain: ev.domain,
          evidence_type: ev.evidence_type,
          credibility_category: ev.credibility_category,
        }));

        let subSearchStatus: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'INSUFFICIENT_EVIDENCE' | 'NOT_REQUIRED' = 'NOT_REQUIRED';
        if (subPlan.search_required) {
          if (subExecutedQueries.some(q => q.status === 'NO_API_KEY')) {
            subSearchStatus = 'INSUFFICIENT_EVIDENCE';
          } else if (subExecutedQueries.length > 0 && subExecutedQueries.every(q => q.status === 'FAILED')) {
            subSearchStatus = 'FAILED';
          } else if (subEvidence.length === 0) {
            subSearchStatus = 'INSUFFICIENT_EVIDENCE';
          } else if (subResearchedEntities.size < subPlan.target_entities.length) {
            subSearchStatus = 'PARTIAL';
          } else {
            subSearchStatus = 'SUCCESS';
          }
        }

        synthesizerSubtopics.push({
          id: sub.id,
          topicTitle: sub.topicTitle,
          domain: sub.domain,
          intent: sub.intent,
          query: sub.query,
          context: subContext,
          comparisons: subComparisons,
          evidence: subEvidence,
          citations: subCitations,
          searchStatus: subSearchStatus,
        });

        const hasSubMemory = subContext.events.length > 0 || subContext.claims.length > 0 || subContext.memories.length > 0;
        topicResearchStatuses.push({
          id: sub.id,
          title: sub.topicTitle,
          domain: sub.domain,
          query: sub.query,
          conversation_title: subContext.target_conversation?.title || (subContext.events[0] ? subContext.events[0].description : undefined),
          conversation_date: subContext.events[0]?.event_time,
          entities: subContext.entities.map(e => e.canonical_name),
          claims_count: subContext.claims.length,
          events_count: subContext.events.length,
          search_required: subPlan.search_required,
          search_status: !hasSubMemory ? 'NO_MEMORY_FOUND' : (subPlan.search_required ? 'SEARCHED' : 'RECALLED_FROM_MEMORY'),
        });
      }

      retrieval_ms = Date.now() - tMultiRetrieval;
      context = synthesizerSubtopics[0].context;
      plan = {
        intent: classification.intent,
        search_required: synthesizerSubtopics.some(s => s.searchStatus !== 'NOT_REQUIRED'),
        search_queries: executedQueries.map(q => ({ query: q.query, target_entity: q.target_entity, search_depth: 'basic' as const })),
        target_entities: allTargetEntitiesList,
      };
      baselineDate = topicResearchStatuses[0]?.conversation_date || temporal.resolved_start || undefined;
      baselineSource = topicResearchStatuses[0]?.conversation_title || undefined;

    } else {
      // Single Topic Execution
      // 5. Retrieve relevant events, messages, entities, and claims
      const t1 = Date.now();
      pushActivity('Reviewing previous conversations & historical context');
      context = this.memoryRetrieval.retrieve({
        userId: options.userId,
        conversationId: options.conversationId,
        timeStart: temporal.resolved_start,
        timeEnd: temporal.resolved_end,
        query: options.userMessage,
      });
      retrieval_ms = Date.now() - t1;
      pushActivity(
        'Historical context reconstructed',
        `Found ${context.events.length} events, ${context.memories.length} decisions, ${context.entities.length} entities, ${context.claims.length} claims`
      );

      // 6. Build a bounded context & 7. Create a research plan
      pushActivity('Generating research plan');
      plan = this.researchPlanner.createPlan(
        options.userMessage,
        classification,
        temporal,
        context
      );

      if (classification.intent === 'HISTORICAL_RECALL') {
        plan.search_required = false;
        plan.search_queries = [];
      }

      // 8. Validate research plan
      sessionId = this.evidenceRepo.createSession(options.conversationId, plan.intent, plan);
      pushActivity(
        'Validated research plan',
        plan.search_required
          ? `Planned ${plan.search_queries.length} targeted search queries across ${plan.target_entities.length} entities`
          : 'Historical context sufficient; live search not required'
      );

      plan.target_entities.forEach((e: string) => unresearchedEntities.add(e));

      // 9. Execute web search if needed & 10. Store evidence
      if (plan.search_required && plan.search_queries.length > 0) {
        const tSearch = Date.now();
        pushActivity('Executing live search queries independently with bounded concurrency');

        const concurrency = 3;
        for (let i = 0; i < plan.search_queries.length; i += concurrency) {
          if (options.signal?.aborted) {
            console.log('[ORCHESTRATOR] AbortSignal active; halting remaining search query batches');
            break;
          }

          const chunk = plan.search_queries.slice(i, i + concurrency);
          const settledResults = await Promise.allSettled(
            chunk.map((q: any) => this.webSearch.searchDetailed(q, options.signal))
          );

          for (let j = 0; j < chunk.length; j++) {
            const q = chunk[j];
            const settled = settledResults[j];
            const searchRes: SearchExecutionResult = settled.status === 'fulfilled'
              ? settled.value
              : {
                  query: q.query,
                  target_entity: q.target_entity,
                  status: 'FAILED',
                  results: [],
                  total_found: 0,
                  valid_count: 0,
                  rejected_count: 0,
                  duration_ms: 0,
                  error: (settled.reason as Error)?.message || 'Search execution failed unexpectedly',
                };

            executedQueries.push({
              query: q.query,
              target_entity: q.target_entity,
              status: searchRes.status,
              results_count: searchRes.valid_count,
              duration_ms: searchRes.duration_ms,
              error: searchRes.error,
            });

            if (searchRes.rejected_sources) {
              allRejectedSources.push(...searchRes.rejected_sources);
            }

            this.evidenceRepo.recordQuery(
              sessionId,
              q.query,
              q.topic,
              q.search_depth,
              searchRes.valid_count
            );

            if (searchRes.status === 'SUCCESS' && searchRes.results.length > 0) {
              if (q.target_entity) {
                researchedEntities.add(q.target_entity);
                unresearchedEntities.delete(q.target_entity);
              }

              for (const res of searchRes.results) {
                const urlValidation = validateExternalUrl(res.url);
                if (!urlValidation.isValid) {
                  continue;
                }

                const evRecord: Evidence = {
                  id: randomUUID(),
                  research_session_id: sessionId,
                  title: res.title,
                  url: res.url,
                  domain: res.domain,
                  snippet: res.snippet,
                  publication_date: res.published_at,
                  retrieved_at: res.retrieved_at,
                  evidence_type: res.evidence_type,
                  credibility_category: res.credibility_category,
                  score: res.score,
                };
                const saved = this.evidenceRepo.saveEvidence(evRecord);
                collectedEvidence.push(saved);
              }

              pushActivity(
                `Search succeeded: ${q.target_entity || q.query}`,
                `${searchRes.valid_count} verified sources retrieved in ${searchRes.duration_ms}ms`
              );
            } else if (searchRes.status === 'NO_API_KEY') {
              pushActivity(
                `Search skipped: ${q.target_entity || q.query}`,
                'Tavily API key not configured; relying strictly on historical claims'
              );
            } else {
              pushActivity(
                `Search yielded no sources: ${q.target_entity || q.query}`,
                searchRes.error || '0 valid results'
              );
            }
          }
        }

        search_ms = Date.now() - tSearch;
        pushActivity(
          'Search execution completed',
          `${collectedEvidence.length} total verified evidence records collected across ${executedQueries.length} executed queries (${allRejectedSources.length} rejected)`
        );
      }

      // 11. Extract and compare claims
      const tComp = Date.now();
      pushActivity('Comparing historical claims against current evidence');

      baselineDate = context.events[0]?.event_time || temporal.resolved_start || undefined;
      baselineSource = context.conversations[0]?.title || (context.events[0] ? context.events[0].description : undefined);

      if (plan.target_entities.length > 0) {
        for (const entityName of plan.target_entities) {
          const ent = this.entityRepo.findByAlias(entityName) || this.entityRepo.findByCanonicalName(entityName);
          const entityEvidence = collectedEvidence.filter(e =>
            e.snippet.toLowerCase().includes(entityName.toLowerCase()) ||
            e.title.toLowerCase().includes(entityName.toLowerCase())
          );

          const existingClaims = ent ? this.claimRepo.getClaimsByEntity(ent.id) : [];

          if (existingClaims.length > 0) {
            for (const claim of existingClaims) {
              const cmp = this.comparisonEngine.compare(
                claim,
                entityEvidence,
                entityName,
                claim.predicate,
                { teamSize: 20, baselineDate }
              );
              comparisons.push(cmp);
            }
          } else {
            const ctxClaim = context.claims.find((c: any) => c.subject_entity_id === ent?.id);
            const cmp = this.comparisonEngine.compare(
              ctxClaim || null,
              entityEvidence,
              entityName,
              'pricing',
              { teamSize: 20, baselineDate }
            );
            comparisons.push(cmp);
          }
        }
      }
      comparison_ms = Date.now() - tComp;
    }

    // Determine overall search status
    if (plan.search_required) {
      if (executedQueries.some(q => q.status === 'NO_API_KEY')) {
        searchStatus = 'INSUFFICIENT_EVIDENCE';
        searchErrorMessage = 'Tavily Search API key is not configured in environment.';
      } else if (executedQueries.length > 0 && executedQueries.every(q => q.status === 'FAILED')) {
        searchStatus = 'FAILED';
        searchErrorMessage = 'All external search queries failed or timed out.';
      } else if (collectedEvidence.length === 0) {
        searchStatus = 'INSUFFICIENT_EVIDENCE';
        searchErrorMessage = 'No verified external sources were returned by search provider.';
      } else if (unresearchedEntities.size > 0) {
        searchStatus = 'PARTIAL';
      } else {
        searchStatus = 'SUCCESS';
      }
    } else {
      searchStatus = 'NOT_REQUIRED';
      searchErrorMessage = undefined;
    }

    // 12. Validate citations (only from real collectedEvidence)
    pushActivity('Verifying citation integrity & source authenticity');
    const citationPool: InlineCitation[] = collectedEvidence.slice(0, 10).map((ev, idx) => ({
      index: idx + 1,
      id: ev.id,
      url: ev.url,
      title: ev.title,
      domain: ev.domain,
      evidence_type: ev.evidence_type,
      credibility_category: ev.credibility_category,
    }));

    if (options.onStream) {
      options.onStream('comparison', { comparisons });
      citationPool.forEach(cit => options.onStream!('citation', cit));
    }

    // 13. Synthesize the response & 14. Stream the response
    const tSynth = Date.now();
    pushActivity('Synthesizing temporal response');

    let assistantContent = await this.synthesizer.synthesize(
      {
        userMessage: options.userMessage,
        intent: plan.intent,
        context,
        comparisons,
        evidence: collectedEvidence,
        citations: citationPool,
        temporalExpr: primaryExpr,
        searchStatus,
        searchErrorMessage,
        subtopics: isMultiTopic ? synthesizerSubtopics : undefined,
      },
      (tokenText) => {
        if (options.onStream) {
          options.onStream('token', { text: tokenText });
        }
      },
      options.signal
    );

    // Validate the final synthesized text citations strictly against collected evidence
    const validation = this.citationValidator.validate(assistantContent, collectedEvidence);
    assistantContent = validation.validatedText;
    const synthesis_ms = Date.now() - tSynth;

    // 15. Persist final assistant message
    const assistantMessageId = randomUUID();
    const assistantMessage: Message = {
      id: assistantMessageId,
      conversation_id: options.conversationId,
      role: 'assistant',
      content: assistantContent,
      created_at: new Date().toISOString(),
      activity_log: activityLog,
      research_session_id: sessionId,
    };
    this.messageRepo.create(assistantMessage);

    // 16. Asynchronous persistence pipeline: Extract and persist useful memories
    try {
      const extractedMemories = this.eventExtractor.extract(
        options.userMessage,
        assistantContent,
        options.conversationId,
        options.userId,
        assistantMessageId
      );

      for (const ev of extractedMemories.events) {
        this.eventRepo.create(ev, extractedMemories.entityIds);
      }
      for (const mem of extractedMemories.memories) {
        this.memoryRepo.create(mem);
      }
    } catch (memErr) {
      console.warn('[AgentOrchestrator] Memory persistence warning:', memErr);
    }

    const total_ms = Date.now() - totalStart;
    pushActivity('Completed response delivery', `Total latency: ${total_ms}ms`);

    // Strictly compute verified changes: only claims where change occurred with verified evidence
    const verifiedChangeStatuses = [
      'CHANGED',
      'INCREASED',
      'DECREASED',
      'ADDED',
      'REMOVED',
      'CONTRADICTED',
      'FEATURE_RELEASED',
    ];

    const verifiedChanges = comparisons.filter(
      c => verifiedChangeStatuses.includes(c.status) && c.evidence_ids.length > 0
    );

    const changesDetectedCount = verifiedChanges.length;

    // Strictly compute verified claims: claims that had valid evidence and were confirmed (unchanged, changed, or feature released)
    const verifiedClaimsCount = comparisons.filter(
      c => (c.status === 'VERIFIED' || c.status === 'UNCHANGED' || c.status === 'CHANGED' || c.status === 'INCREASED' || c.status === 'DECREASED' || c.status === 'FEATURE_RELEASED') && c.evidence_ids.length > 0
    ).length;

    const unverifiedCount = comparisons.filter(
      c => c.status === 'UNVERIFIED' || c.status === 'UNKNOWN' || c.status === 'CONFLICTING' || c.status === 'INCOMPARABLE_BILLING_CYCLE' || c.evidence_ids.length === 0
    ).length;

    const successfulQueriesCount = executedQueries.filter(q => q.status === 'SUCCESS' && q.results_count > 0).length;
    const failedQueriesCount = executedQueries.filter(q => q.status === 'FAILED' || q.status === 'NO_API_KEY').length;

    const sourcesRetrievedCount = executedQueries.reduce((sum, q) => sum + (q.results_count || 0), 0) + allRejectedSources.length;
    const sourcesAcceptedCount = collectedEvidence.length;
    const sourcesRejectedCount = allRejectedSources.length;

    const activitySummary: ResearchActivitySummary = {
      planned_queries_count: isMultiTopic ? executedQueries.length : plan.search_queries.length,
      executed_queries_count: executedQueries.length,
      successful_queries_count: successfulQueriesCount,
      failed_queries_count: failedQueriesCount,
      historical_events_retrieved: context.events.length,
      historical_baseline_date: baselineDate,
      historical_baseline_source: baselineSource,
      relevant_entities: plan.target_entities,
      researched_entities: Array.from(researchedEntities),
      unresearched_entities: Array.from(unresearchedEntities),
      queries: executedQueries,
      search_queries_performed: executedQueries.map(q => q.query),
      sources_collected: collectedEvidence.length,
      sources_retrieved_count: sourcesRetrievedCount,
      sources_accepted_count: sourcesAcceptedCount,
      sources_rejected_count: sourcesRejectedCount,
      rejected_sources: allRejectedSources,
      claims_verified: verifiedClaimsCount,
      changes_detected: changesDetectedCount,
      unverified_count: unverifiedCount,
      search_status: searchStatus,
      search_error_message: searchErrorMessage,
      topics: isMultiTopic ? topicResearchStatuses : undefined,
    };

    if (options.onStream) {
      options.onStream('message_completed', {
        message_id: assistantMessageId,
        activity_log: activityLog,
        citations: validation.report.validCitations,
        activity_summary: activitySummary,
      });
    }

    return {
      message: assistantMessage,
      activity_log: activityLog,
      citations: validation.report.validCitations,
      comparisons,
      activity_summary: activitySummary,
      latencies: {
        intent_ms,
        retrieval_ms,
        search_ms,
        comparison_ms,
        synthesis_ms,
        total_ms,
      },
    };
  }
}
