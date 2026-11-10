import { IntentType } from '../types/index.js';
import { detectQueryDomain } from './entity-resolver.js';

export interface ClassificationResult {
  intent: IntentType;
  confidence: number;
  reason: string;
  hasTemporalReference: boolean;
  hasComparisonCue: boolean;
  hasVerificationCue: boolean;
}

export interface SubTopicPlan {
  id: string;
  topicTitle: string;
  query: string;
  domain: 'CRM' | 'DATABASE_HOSTING' | 'GENERAL';
  intent: IntentType;
  confidence: number;
  hasTemporalReference: boolean;
  hasComparisonCue: boolean;
  hasVerificationCue: boolean;
  temporalExpression?: string;
}

export class IntentClassifier {
  /**
   * Decomposes a potentially multi-topic prompt into distinct, isolated topic plans.
   * Ensures queries like "What did we decide about CRM pricing? Also, what did we research about PostgreSQL hosting?"
   * are executed and answered independently without omitting any topic.
   */
  decomposeIntoTopics(message: string, hasConversationHistory: boolean = false): SubTopicPlan[] {
    const raw = message.trim();
    if (!raw) return [];

    // If the message is a compound answer-verification request like
    // "What did I ask you on 3 November? Is your answer still correct today?",
    // do NOT split into multiple topics because the second clause verifies the first.
    const isAnswerVerification = /\b(is (your |the )?answer still (correct|true|accurate)|is that still (true|correct|accurate))\b/i.test(raw);
    if (isAnswerVerification) {
      const classification = this.classify(raw, hasConversationHistory);
      const domain = detectQueryDomain(raw);
      return [{
        id: 'topic-1',
        topicTitle: domain === 'CRM' ? 'CRM Pricing & Shortlist' : domain === 'DATABASE_HOSTING' ? 'PostgreSQL Hosting & Backups' : 'General Query',
        query: raw,
        domain,
        intent: classification.intent,
        confidence: classification.confidence,
        hasTemporalReference: classification.hasTemporalReference,
        hasComparisonCue: classification.hasComparisonCue,
        hasVerificationCue: classification.hasVerificationCue,
      }];
    }

    // Split on common multi-topic delimiters: question marks followed by text, "also,", "additionally,", "and what did/about"
    const splitRegex = /(?:\?\s+(?=[A-Z0-9])|\b(?:also|additionally|furthermore|in addition|and what about|and did we|plus)\b[\s,]*)/i;
    let parts = raw.split(splitRegex).map(p => p.trim()).filter(p => p.length > 0);

    // If split resulted in only 1 part, check if both CRM and Database Hosting domains are present
    const hasCrm = /\b(crm|sales\s+team|salesforce|hubspot|zoho|pipedrive|freshsales)\b/i.test(raw);
    const hasDb = /\b(postgres|postgresql|database|hosting|neon|supabase|rds|pitr|backups?)\b/i.test(raw);

    if (parts.length <= 1 && hasCrm && hasDb) {
      // Split on conjunction 'and' or sentence punctuation
      const sentenceParts = raw.split(/(?:\?|\.|\band\b)/i).map(p => p.trim()).filter(p => p.length > 5);
      if (sentenceParts.length >= 2) {
        parts = sentenceParts;
      }
    }

    // If still a single topic or unable to split distinctly, return single topic plan
    if (parts.length <= 1) {
      const classification = this.classify(raw, hasConversationHistory);
      const domain = detectQueryDomain(raw);
      const title = domain === 'CRM'
        ? 'CRM Pricing & Shortlist'
        : domain === 'DATABASE_HOSTING'
        ? 'PostgreSQL Hosting & Backups'
        : 'General Query';

      return [{
        id: 'topic-1',
        topicTitle: title,
        query: raw,
        domain,
        intent: classification.intent,
        confidence: classification.confidence,
        hasTemporalReference: classification.hasTemporalReference,
        hasComparisonCue: classification.hasComparisonCue,
        hasVerificationCue: classification.hasVerificationCue,
      }];
    }

    // Build independent subtopic plans
    const subtopics: SubTopicPlan[] = [];
    let idx = 1;

    for (const part of parts) {
      const cleanPart = part.replace(/^[,\s;]+|[,\s;]+$/g, '').trim();
      if (!cleanPart) continue;

      const classification = this.classify(cleanPart, hasConversationHistory);
      const domain = detectQueryDomain(cleanPart);
      let title = `Topic ${idx}`;
      if (domain === 'CRM') title = 'CRM Pricing & Shortlist Decisions';
      else if (domain === 'DATABASE_HOSTING') title = 'PostgreSQL Managed Hosting Research';
      else title = `Research Topic ${idx}`;

      subtopics.push({
        id: `topic-${idx}`,
        topicTitle: title,
        query: cleanPart,
        domain,
        intent: classification.intent,
        confidence: classification.confidence,
        hasTemporalReference: classification.hasTemporalReference,
        hasComparisonCue: classification.hasComparisonCue,
        hasVerificationCue: classification.hasVerificationCue,
      });
      idx++;
    }

    return subtopics.length > 0 ? subtopics : [{
      id: 'topic-1',
      topicTitle: 'General Query',
      query: raw,
      domain: detectQueryDomain(raw),
      ...this.classify(raw, hasConversationHistory),
    }];
  }

  classify(message: string, hasConversationHistory: boolean = false): ClassificationResult {
    const text = message.trim().toLowerCase();

    const changeCues = [
      /\b(has|have|did)\b.*\b(change|changed|update|updated|shipped|announced|price difference|pricing change)\b/i,
      /\bhas (any|any of them|anything|pricing|anyone)\s+(changed|updated|shipped|moved)\b/i,
      /\bwhat('s| has| is)\s+(different|changed|new)\b/i,
      /\bcompare (the )?latest\b/i,
      /\bany updates? since\b/i,
      /\bhas .* changed pricing\b/i,
    ];

    const verificationCues = [
      /\bis (your |the )?(answer|recommendation|claim|statement|information|research)\s+(still|yet)\s+(correct|true|accurate|valid|holding up)\b/i,
      /\bis that still (true|accurate|correct|valid)\b/i,
      /\bverify (your|the|previous)\s+(answer|claim|statement)\b/i,
      /\bcheck if .* is still (true|correct|accurate)\b/i,
      /\bis it still (true|correct|the same|valid)\b/i,
    ];

    const historicalRecallCues = [
      /\bwhat did (i|we) (ask|discuss|decide|shortlist|say|talk about)\b/i,
      /\bwhat was (my|our|the) (shortlist|decision|recommendation|question)\b/i,
      /\bwho did (we|i) pick\b/i,
      /\bwhat were (the|our) (5|five|\d+)?\s*(options|tools|picks|crm|providers)\b/i,
      /\bwhat did i ask you on\b/i,
      /\bremind me what\b/i,
    ];

    const currentResearchCues = [
      /\bsearch (the web|for|current|latest)\b/i,
      /\bwhat (is|are) (current|latest|today's|newest)\b/i,
      /\blookup\b/i,
      /\bfind (recent|current|latest|new)\b/i,
    ];

    const temporalCues = [
      /\b(yesterday|today|last week|this week|last month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|november|december|january|february|since then|since our|since we)\b/i,
    ];

    const hasTemporal = temporalCues.some(r => r.test(text));
    const hasChange = changeCues.some(r => r.test(text));
    const hasVerification = verificationCues.some(r => r.test(text));
    const hasHistorical = historicalRecallCues.some(r => r.test(text));
    const hasCurrent = currentResearchCues.some(r => r.test(text));

    // Scenario B: "What did I ask you on 3 November? Is your answer still correct today?"
    // Contains both historical question recall AND answer verification
    if (hasVerification) {
      return {
        intent: 'ANSWER_VERIFICATION',
        confidence: 0.96,
        reason: 'User asks to verify validity/accuracy of previous information or answer.',
        hasTemporalReference: hasTemporal,
        hasComparisonCue: hasChange,
        hasVerificationCue: true,
      };
    }

    // Scenario A & C: Change detection ("Has any of them changed pricing...", "Has any pricing changed since then?")
    if (hasChange && (hasTemporal || hasHistorical || hasConversationHistory)) {
      return {
        intent: 'CHANGE_DETECTION',
        confidence: 0.95,
        reason: 'User requests detecting changes since a previous discussion or temporal point.',
        hasTemporalReference: hasTemporal,
        hasComparisonCue: true,
        hasVerificationCue: false,
      };
    }

    // Pure Historical Recall
    if (hasHistorical) {
      return {
        intent: 'HISTORICAL_RECALL',
        confidence: 0.93,
        reason: 'User asks about past conversation, shortlist, or decision.',
        hasTemporalReference: hasTemporal,
        hasComparisonCue: false,
        hasVerificationCue: false,
      };
    }

    // Current Web Research
    if (hasCurrent) {
      return {
        intent: 'CURRENT_RESEARCH',
        confidence: 0.90,
        reason: 'User explicitly requests current web research.',
        hasTemporalReference: hasTemporal,
        hasComparisonCue: false,
        hasVerificationCue: false,
      };
    }

    // Follow-up context
    if (hasConversationHistory && (text.length < 40 || /\b(why|how about|what about that|and what else|which one)\b/i.test(text))) {
      return {
        intent: 'FOLLOW_UP',
        confidence: 0.85,
        reason: 'Short query continuing previous conversational context.',
        hasTemporalReference: hasTemporal,
        hasComparisonCue: hasChange,
        hasVerificationCue: false,
      };
    }

    // Ambiguous check
    if (text.length < 6 && !['hi', 'hello', 'hey', 'help'].includes(text)) {
      return {
        intent: 'AMBIGUOUS',
        confidence: 0.70,
        reason: 'Input is too brief or ambiguous to reliably determine action without clarification.',
        hasTemporalReference: false,
        hasComparisonCue: false,
        hasVerificationCue: false,
      };
    }

    // Default to General Chat
    return {
      intent: 'GENERAL_CHAT',
      confidence: 0.88,
      reason: 'General query or conversational turn.',
      hasTemporalReference: hasTemporal,
      hasComparisonCue: false,
      hasVerificationCue: false,
    };
  }
}

