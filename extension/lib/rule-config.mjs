// Vendors whose best-practice rules run.
// Rules registered for other vendors in vendor-rules.mjs are inactive.
export const bestPracticeVendors = ['Meta', 'GA4', 'Google Ads', 'Pinterest', 'Microsoft Ads'];

// Optional settings keyed by rule ID. Omitted rules use their own defaults.
// Example: 'ga4.purchase_value': { enabled: false }
// Example: 'meta.event_case': { severity: 'error' }
// Rule logic belongs in rules/*.mjs, not in this configuration.
export const ruleSettings = {};
