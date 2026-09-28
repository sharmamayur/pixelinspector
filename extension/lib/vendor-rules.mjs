import meta from './rules/meta.mjs';
import ga4 from './rules/ga4.mjs';
import googleAds from './rules/google-ads.mjs';
import pinterest from './rules/pinterest.mjs';
import payload from './rules/payload.mjs';
import { sources } from './rules/sources.mjs';
import { bestPracticeVendors, ruleSettings } from './rule-config.mjs';

export { sources };
// Reader-facing list of checked vendors, e.g. "Meta, GA4, and Google Ads".
export const checkedVendors = new Intl.ListFormat('en', { type: 'conjunction' }).format(bestPracticeVendors);
export const vendorRules = {
  Meta: meta,
  GA4: ga4,
  'Google Ads': googleAds,
  Pinterest: pinterest,
};
export const sharedRules = payload;

// Rules inspect browser payloads, never infer account configuration or delivery.
export function vendorFindings(event, settings = ruleSettings) {
  // Unknown request formats are parser limitations, not implementation defects.
  if (event.platform === 'Google tag') return [];
  if (event.platform === 'Google Ads' && !/^(?:AW-)?\d+$/i.test(event.pixelId || '')) return [];
  const findings = [];
  for (const rule of [...(vendorRules[event.platform] || []), ...sharedRules]) {
    const setting = settings[rule.id] || {};
    if (setting.enabled === false) continue;
    const severity = setting.severity ?? rule.severity;
    if (!['error', 'warning'].includes(severity)) throw new Error(`Invalid severity for rule ${rule.id}: ${severity}`);
    const result = rule.evaluate(event);
    if (!result) continue;
    findings.push({
      code: rule.id,
      severity,
      platform: event.platform,
      action: event.action,
      evidence: [event.id],
      text: `${event.platform} ${event.event}: ${result.text}`,
      fix: result.fix,
      source: rule.source ?? sources[event.platform],
    });
  }
  return findings;
}

// Request-level checks are independent of inferred actions and response status.
export function bestPracticeFindings(events, settings = ruleSettings) {
  return events.filter(event => bestPracticeVendors.includes(event.platform))
    .flatMap(event => vendorFindings(event, settings).map(finding => ({
      ...finding,
      eventId: event.id,
      eventName: event.event,
      pixelId: event.pixelId,
      category: finding.severity === 'error' ? 'Payload issue' : 'Recommendation',
    })));
}
