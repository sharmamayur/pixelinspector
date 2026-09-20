import test from 'node:test';
import assert from 'node:assert/strict';
import { vendorFindings, bestPracticeFindings, vendorRules, sharedRules } from '../../extension/lib/vendor-rules.mjs';
import { decodeEvents } from './analyze.mjs';

const purchase = () => ({ ...decodeEvents('https://www.facebook.com/tr/?id=123&ev=Purchase')[0], id: 'E1' });

test('disabling a vendor rule removes only that finding', () => {
  const event = { ...purchase(), pixelId: 'unknown' };
  const settings = { 'meta.purchase_fields': { enabled: false } };
  assert.deepEqual(vendorFindings(event, settings).map(f => f.code), ['meta.pixel_id']);
  assert.ok(vendorFindings(event).some(f => f.code === 'meta.purchase_fields'));
});

test('severity overrides preserve evidence and update the UI category', () => {
  const event = purchase();
  const [original] = bestPracticeFindings([event]);
  const [overridden] = bestPracticeFindings([event], { 'meta.purchase_fields': { severity: 'warning' } });
  assert.deepEqual(overridden, { ...original, severity: 'warning', category: 'Recommendation' });
  assert.equal(bestPracticeFindings([event])[0].severity, 'error');
});

test('shared rules can be disabled and other validations remain active', () => {
  const event = { ...purchase(), value: 'bad', currency: 'usd' };
  assert.deepEqual(vendorFindings(event, { 'payload.value': { enabled: false } }).map(f => f.code), ['payload.currency']);
});

test('invalid severity is reported instead of silently changing categorization', () => {
  assert.throws(() => vendorFindings(purchase(), { 'meta.purchase_fields': { severity: 'typo' } }), /Invalid severity for rule meta.purchase_fields/);
});

test('rules have unique stable IDs and executable evaluations', () => {
  const rules = [...Object.values(vendorRules).flat(), ...sharedRules];
  assert.equal(new Set(rules.map(rule => rule.id)).size, rules.length);
  for (const rule of rules) {
    assert.equal(typeof rule.evaluate, 'function');
    assert.ok(['error', 'warning'].includes(rule.severity));
  }
});
