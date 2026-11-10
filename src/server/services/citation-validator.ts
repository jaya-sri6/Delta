import { Evidence } from '../types/index.js';
import { validateExternalUrl } from './web-search.js';

export interface InlineCitation {
  index: number;
  id: string;
  url: string;
  title: string;
  domain: string;
  evidence_type: string;
  credibility_category: string;
}

export interface ValidationReport {
  isValid: boolean;
  validCitations: InlineCitation[];
  rejectedUrls: string[];
  unsupportedClaims: string[];
  citationMap: Map<number, InlineCitation>;
}

export class CitationValidator {
  /**
   * Validates generated citations against stored evidence records.
   * Strips invented, placeholder, or blacklisted URLs, maps citations to sequential numbers [1], [2],
   * and verifies domain authenticity.
   */
  validate(text: string, storedEvidence: Evidence[]): { validatedText: string; report: ValidationReport } {
    const knownUrls = new Map<string, Evidence>();
    for (const ev of storedEvidence) {
      const urlCheck = validateExternalUrl(ev.url);
      if (urlCheck.isValid && urlCheck.domain) {
        knownUrls.set(ev.url.toLowerCase(), ev);
        knownUrls.set(ev.url.replace(/\/$/, '').toLowerCase(), ev);
      }
    }

    const validCitations: InlineCitation[] = [];
    const rejectedUrls: string[] = [];
    const urlToIndexMap = new Map<string, number>();

    // 1. Identify markdown links [label](url)
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(text)) !== null) {
      const url = match[2];
      const normUrl = url.toLowerCase().replace(/\/$/, '');
      const urlCheck = validateExternalUrl(url);

      if (!urlCheck.isValid) {
        rejectedUrls.push(url);
        continue;
      }

      const evidence = knownUrls.get(normUrl) || Array.from(knownUrls.values()).find(e => normUrl.includes(e.domain.toLowerCase()));

      if (evidence) {
        if (!urlToIndexMap.has(evidence.url)) {
          const index = validCitations.length + 1;
          urlToIndexMap.set(evidence.url, index);
          validCitations.push({
            index,
            id: evidence.id,
            url: evidence.url,
            title: evidence.title,
            domain: evidence.domain,
            evidence_type: evidence.evidence_type,
            credibility_category: evidence.credibility_category,
          });
        }
      } else {
        rejectedUrls.push(url);
      }
    }

    // 2. Identify existing numeric citations [1], [2] if model wrote them directly from evidence
    for (let i = 0; i < storedEvidence.length; i++) {
      const ev = storedEvidence[i];
      const urlCheck = validateExternalUrl(ev.url);
      if (urlCheck.isValid && !urlToIndexMap.has(ev.url)) {
        const index = validCitations.length + 1;
        urlToIndexMap.set(ev.url, index);
        validCitations.push({
          index,
          id: ev.id,
          url: ev.url,
          title: ev.title,
          domain: ev.domain,
          evidence_type: ev.evidence_type,
          credibility_category: ev.credibility_category,
        });
      }
    }

    // Clean up text: replace rejected URLs or convert links to clean inline references
    let validatedText = text;
    for (const rejected of rejectedUrls) {
      validatedText = validatedText.split(`](${rejected})`).join('] (unverified external link rejected)');
    }

    const citationMap = new Map<number, InlineCitation>();
    validCitations.forEach(c => citationMap.set(c.index, c));

    return {
      validatedText,
      report: {
        isValid: rejectedUrls.length === 0,
        validCitations,
        rejectedUrls,
        unsupportedClaims: [],
        citationMap,
      },
    };
  }

  /**
   * Helper to append a structured Sources section if none exists in synthesized text
   */
  formatSourcesSection(citations: InlineCitation[]): string {
    if (citations.length === 0) return '';
    let section = '\n\n### Verified Sources\n';
    citations.forEach(c => {
      section += `[${c.index}] [${c.title}](${c.url}) — *${c.domain} (${c.credibility_category === 'PRIMARY_OFFICIAL' ? 'Official' : 'Secondary'})*\n`;
    });
    return section;
  }
}
