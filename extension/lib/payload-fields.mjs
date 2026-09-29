const hasValue = value => value !== null && value !== undefined && String(value).trim() !== '';

function displayValue(value) {
  if (!hasValue(value)) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return String(text).replace(/\s+/g, ' ').slice(0, 500);
}

export function requiredField(name, value, requirement) {
  return {
    name,
    present: hasValue(value),
    value: displayValue(value),
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
    fields.push({ name, value: displayValue(value) });
  }
  return fields;
}

// Indented display text for a stored JSON field, falling back to the text as sent.
export function prettyJson(json) {
  try { return JSON.stringify(JSON.parse(json), null, 2); } catch { return String(json); }
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
