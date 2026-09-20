// Controls which vendors appear in the extension's best-practice UI and exports.
// The audit analyzer still runs all registered vendor rules.
export const bestPracticeVendors = ['Meta', 'GA4'];

// Optional settings keyed by rule ID. Omitted rules use their own defaults.
// Example: 'ga4.purchase_value': { enabled: false }
// Example: 'meta.event_case': { severity: 'error' }
// Rule logic belongs in rules/*.mjs, not in this configuration.
export const ruleSettings = {};
