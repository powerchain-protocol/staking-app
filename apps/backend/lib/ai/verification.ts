import type { AiCitation, AiCertainty } from './types';

const FACTUAL = /\b(is|are|was|were|has|have|current|balance|rate|price|supply|transaction|proposal|network|epoch|operator|validator|bridge|reward|stake|status|available|claimable|locked|finalized|reconciled|coverage|latency|amount|total|voting|quorum)\b/i;

export function parseStructuredAnswer(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  for (const candidate of [trimmed, fenced].filter((x): x is string => Boolean(x))) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed.answer === 'string') return parsed;
    } catch { /* Provider did not return structured JSON; verifier still applies. */ }
  }
  return { answer: trimmed, citationIds: [], unsupportedClaims: [] };
}

function inlineIds(sentence: string) {
  return [...sentence.matchAll(/\[([A-Za-z0-9_.:-]+)\]/g)].map((match) => match[1]);
}

function sentences(value: string) {
  return value.replace(/\r\n/g, '\n').split(/(?<=[.!?])(?:\s+|\n+)|\n{2,}/).map((x) => x.trim()).filter(Boolean);
}

export function verifyGroundedAnswer(input: { answer: string; requestedCitationIds: string[]; available: AiCitation[]; evidenceRequired: boolean }) {
  const available = new Map(input.available.map((citation) => [citation.id, citation]));
  const requested = new Set(input.requestedCitationIds.filter((id) => available.has(id)));
  const parts = sentences(input.answer);
  const factualClaims = parts.filter((part) => FACTUAL.test(part));
  const unsupported: string[] = [];
  const retained: string[] = [];
  const used = new Set<string>();
  let supportedFactualClaims = 0;

  for (const part of parts) {
    if (!input.evidenceRequired || !FACTUAL.test(part)) {
      retained.push(part);
      continue;
    }
    const ids = inlineIds(part).filter((id) => available.has(id));
    if (!ids.length) {
      unsupported.push(part);
      continue;
    }
    ids.forEach((id) => used.add(id));
    supportedFactualClaims += 1;
    retained.push(part);
  }

  // citationIds returned by a provider are only a consistency hint. They never create
  // support by themselves; operational claims must include an inline verified marker.
  const unusedRequestedCitationIds = [...requested].filter((id) => !used.has(id));

  if (input.evidenceRequired && factualClaims.length && supportedFactualClaims === 0) {
    return {
      answer: 'I do not have sufficient verified evidence to answer that reliably. Check the relevant live PowerChain data source or provide a trusted source document.',
      certainty: 'UNAVAILABLE' as AiCertainty,
      citations: [],
      unsupportedClaims: factualClaims,
      unusedRequestedCitationIds,
      citationCoverage: 0,
      factualClaimsCount: factualClaims.length,
      supportedFactualClaims: 0,
      abstained: true,
    };
  }

  let answer = retained.join('\n\n').trim();
  if (unsupported.length) answer = `${answer}${answer ? '\n\n' : ''}I omitted ${unsupported.length} factual statement${unsupported.length === 1 ? '' : 's'} that could not be tied to verified evidence.`;
  const citations = [...used].map((id) => available.get(id)!).filter(Boolean);
  const citationCoverage = factualClaims.length ? supportedFactualClaims / factualClaims.length : 1;
  const certainty: AiCertainty = citations.some((x) => x.sourceType === 'POWERCHAIN_TOOL') ? 'VERIFIED' : citations.length ? 'GROUNDED' : 'INFERENCE';
  return { answer, certainty, citations, unsupportedClaims: unsupported, unusedRequestedCitationIds, citationCoverage, factualClaimsCount: factualClaims.length, supportedFactualClaims, abstained: false };
}
