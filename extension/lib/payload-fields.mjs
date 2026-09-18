const hasValue = value => value !== null && value !== undefined && String(value).trim() !== '';
const sensitiveName = name => /(?:^|[.[_])(email|e[-_]?mail|em|phone|ph|first[-_]?name|last[-_]?name|full[-_]?name|address|street|postal|zip|dob|birth|user|uid|uuid|mid|aid|user[-_]?id|external[-_]?id|client[-_]?id|order[-_]?id|transaction[-_]?id|event[-_]?id|cookie|click[-_]?id|gclid|fbclid|msclkid|ip|user[-_]?agent)(?:$|[.\]_])/i.test(name);

function safeValue(name, value, hide = false) {
  if (!hasValue(value)) return null;
  if (hide || sensitiveName(name)) return 'Present (value not retained)';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return String(text).replace(/\s+/g, ' ').slice(0, 500);
}

export function requiredField(name, value, requirement, options = {}) {
  return {
    name,
    present: hasValue(value),
    value: safeValue(name, value, options.hide),
    requirement,
  };
}

export function customFields(entries, excluded = []) {
  const excludedNames = new Set(excluded);
  const fields = [];
  const seen = new Set();
  for (const [rawName, value] of entries) {
    const name = String(rawName || '').slice(0, 160);
    if (!name || excludedNames.has(name) || !hasValue(value) || seen.has(name)) continue;
    seen.add(name);
    fields.push({ name, value: safeValue(name, value) });
  }
  return fields;
}

export function payloadFields(entries) {
  return entries.map(([rawName, rawValue]) => {
    const name = String(rawName || '') || 'Unnamed field';
    const value = rawValue == null || String(rawValue) === '' ? 'Empty' : String(rawValue);
    return { name, value };
  });
}

export function flattenFields(value, prefix = '') {
  if (value === null || value === undefined) return prefix ? [[prefix, '']] : [];
  if (Array.isArray(value)) return value.flatMap((entry, index) => flattenFields(entry, `${prefix}[${index}]`));
  if (typeof value === 'object') return Object.entries(value).flatMap(([key, entry]) => flattenFields(entry, prefix ? `${prefix}.${key}` : key));
  return [[prefix, value]];
}
