import type{ResponseStyle}from'./types';
export const RESPONSE_STYLES:Record<ResponseStyle,string>={
 professional:'Professional, precise and structured. Lead with the answer, then material evidence and operational caveats. Avoid hype.',
 concise:'Compact and direct. Use only the minimum detail needed to answer accurately.',
 operator:'Operational runbook style. State current status, impact, checks, safe next action and rollback/stop conditions.',
 analyst:'Analytical style. Separate observations, evidence, calculations, assumptions and uncertainty.',
 technical:'Engineering style. Use protocol vocabulary, interfaces, invariants and failure modes. Prefer exact field and endpoint names.',
 executive:'Executive style. Summarize decision relevance, material risks, evidence strength and recommended next action.'
};
export function responseStylePrompt(style:ResponseStyle){return RESPONSE_STYLES[style]??RESPONSE_STYLES.professional}
