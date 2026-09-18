import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeEvents, analyze, reportHtml } from './analyze.mjs';
const inspect = (url, body = '') => analyze([{name:'test'}], decodeEvents(url,body).map((event,i)=>({...event,step:'test',id:`E${i+1}`})));
const codes = findings => findings.map(f=>f.code);
test('Meta Purchase requires value/currency but AddToCart and custom events do not', () => {
  assert.ok(codes(inspect('https://www.facebook.com/tr/?id=123&ev=Purchase')).includes('meta.purchase_fields'));
  for (const event of ['AddToCart','PageView','CustomThing']) assert.equal(inspect(`https://www.facebook.com/tr/?id=123&ev=${event}`).length,0);
});
test('payload fields split required schema from website-supplied fields', () => {
  const [meta] = decodeEvents('https://www.facebook.com/tr/?id=123&ev=Purchase&cd[value]=29.95&cd[currency]=USD&cd[content_category]=Shoes&cd[email]=person%40example.com');
  assert.deepEqual(meta.requiredFields.map(field => [field.name,field.present]), [['Pixel ID',true],['Event name',true],['value',true],['currency',true]]);
  assert.deepEqual(meta.customFields, [
    {name:'cd[content_category]',value:'Shoes'},
    {name:'cd[email]',value:'Present (value not retained)'},
  ]);
  assert.ok(meta.payloadFields.some(field => field.name === 'cd[content_category]' && field.value === 'Shoes'));
  assert.equal(meta.payloadFields.find(field => field.name === 'cd[email]').value, 'person@example.com');

  const [ga4] = decodeEvents('https://www.google-analytics.com/g/collect?tid=G-123&en=purchase&ep.transaction_id=ORDER-PRIVATE&epn.value=20&ep.currency=USD&pr1=idSKU~nmShoe&ep.coupon=SPRING');
  assert.equal(ga4.requiredFields.find(field => field.name === 'transaction_id').value, 'Present (value not retained)');
  assert.equal(ga4.requiredFields.find(field => field.name === 'items').value, '1 item');
  assert.ok(ga4.customFields.some(field => field.name === 'ep.coupon' && field.value === 'SPRING'));
  assert.equal(ga4.payloadFields.find(field => field.name === 'ep.transaction_id').value, 'ORDER-PRIVATE');
});
test('Meta malformed IDs and standard-name casing are distinguished', () => {
  const findings = inspect('https://www.facebook.com/tr/?id=PIXEL_ID&ev=purchase');
  assert.equal(findings.find(f=>f.code==='meta.pixel_id').severity,'error');
  assert.equal(findings.find(f=>f.code==='meta.event_case').severity,'warning');
});
test('values reject template strings, whitespace, currency symbols, NaN and comma decimals; zero is valid', () => {
  for (const value of ['{{total}}',' ','$20','NaN','1,20','Infinity','0x10']) {
    assert.ok(codes(inspect(`https://www.facebook.com/tr/?id=123&ev=Purchase&cd[currency]=USD&cd[value]=${encodeURIComponent(value)}`)).includes('payload.value'));
  }
  assert.equal(inspect('https://www.facebook.com/tr/?id=123&ev=Purchase&cd[currency]=USD&cd[value]=0').length,0);
});
test('GA4 validates transaction ID, retains it in the full payload, and accepts item name without ID', () => {
  const base='https://www.google-analytics.com/g/collect?tid=G-123&en=purchase&epn.value=20&cu=USD&pr1=nmShoe~pr20';
  assert.ok(codes(inspect(base)).includes('ga4.transaction_id'));
  assert.equal(inspect(base+'&ep.transaction_id=private-order').length,0);
  assert.equal(inspect(base+'&epn.transaction_id=123').length,0);
  assert.equal(decodeEvents(base+'&ep.transaction_id=private-order')[0].payloadFields.find(field => field.name === 'ep.transaction_id').value, 'private-order');
});
test('GA4 item identity and conditional currency checks', () => {
  const findings=inspect('https://www.google-analytics.com/g/collect?tid=G-123&en=add_to_cart&epn.value=20&pr1=pr20~qt1');
  assert.ok(codes(findings).includes('ga4.item_identity'));
  assert.ok(codes(findings).includes('ga4.currency_required'));
  assert.equal(inspect('https://www.google-analytics.com/g/collect?tid=G-123&en=add_to_cart&pr1=idSKU').length,0);
});
test('GA4 valid unicode and automatic events are not mistaken for setup errors', () => {
  for (const name of ['page_view','session_start','scroll','购买']) assert.equal(inspect(`https://www.google-analytics.com/g/collect?tid=G-123&en=${encodeURIComponent(name)}`).length,0);
  assert.ok(codes(inspect('https://www.google-analytics.com/g/collect?tid=G-123&en=bad%20name')).includes('ga4.event_name'));
});
test('Google Ads remarketing is not a mislabeled conversion; defaults are allowed', () => {
  assert.equal(decodeEvents('https://www.googleadservices.com/pagead/viewthroughconversion/123/?value=0')[0].event,'remarketing');
  assert.equal(inspect('https://www.googleadservices.com/pagead/viewthroughconversion/123/?value=0').length,0);
  assert.equal(inspect('https://www.googleadservices.com/pagead/conversion/123/?label=ABC').length,0);
  assert.ok(codes(inspect('https://www.googleadservices.com/pagead/conversion/123/?label=ABC&value=bad')).includes('payload.value'));
});
test('live validation flags observed malformed payload immediately but defers missing expectations', () => {
  const steps=[{name:'test',expect:[{platform:'GA4',event:'purchase'}]}];
  const events=decodeEvents('https://www.facebook.com/tr/?id=123&ev=Purchase').map(e=>({...e,step:'test',id:'E1'}));
  const findings=analyze(steps,events,{live:true});
  assert.ok(codes(findings).includes('meta.purchase_fields'));
  assert.ok(!codes(findings).includes('event.not_observed'));
  assert.ok(codes(analyze([{...steps[0],endedAt:'now'}],events,{live:true})).includes('event.not_observed'));
});
test('reports present observed evidence without rule-based findings', () => {
  const findings=inspect('https://www.facebook.com/tr/?id=123&ev=Purchase');
  const events=decodeEvents('https://www.facebook.com/tr/?id=123&ev=Purchase');
  const html=reportHtml({site:'test',startedAt:'2026-01-01',browser:'test',consent:'test',steps:[],events,findings});
  assert.match(html,/Observed browser requests/);
  assert.doesNotMatch(html,/Setup errors and warnings|Vendor reference|order value/);
});

test('Google Ads destination ID comes from path, never an unrelated G- tid', () => {
  const url = 'https://www.google.com/pagead/1p-conversion/387655271/?tid=G-4WL8DDJFSY';
  const [event] = decodeEvents(url);
  assert.equal(event.platform, 'Google Ads');
  assert.equal(event.pixelId, '387655271');
  assert.equal(inspect(url).length, 0);
});
test('unrecognized Google destination formats are neutral, not malformed-ID errors', () => {
  for (const suffix of ['G-4WL8DDJFSY/', '', 'unknown/', '123abc/']) {
    const url = `https://www.google.com/pagead/1p-conversion/${suffix}?tid=G-4WL8DDJFSY&value=unrecognized`;
    const [event] = decodeEvents(url);
    assert.equal(event.platform, 'Google tag');
    assert.equal(event.event, 'unclassified request');
    assert.ok(event.classificationNote);
    assert.equal(inspect(url).length, 0);
  }
});
test('unknown IDs in older Google Ads records do not generate setup errors', () => {
  for (const pixelId of ['unknown', 'G-4WL8DDJFSY']) {
    const findings = analyze([{name:'test'}], [{platform:'Google Ads', event:'remarketing', pixelId, step:'test', id:'E1'}]);
    assert.equal(findings.length, 0);
  }
});

test('Floodlight semicolon paths retain configuration and the complete payload', () => {
  for (const prefix of ['https://www.google.com/gmp/conversion/', 'https://ad.doubleclick.net/ddm/activity/', 'https://123.fls.doubleclick.net/activityi;']) {
    const [event] = decodeEvents(prefix + '_dc_unique_id=PRIVATE;cid=SECRET;src=10743458;type=cargu;cat=cargu0;ord=ORDER;~oref=https%3A%2F%2Fprivate.test');
    assert.equal(event.platform, 'Google Floodlight');
    assert.equal(event.pixelId, '10743458');
    assert.equal(event.event, 'Activity cargu0');
    assert.equal(event.activityGroup, 'cargu');
    assert.equal(event.payloadFields.find(field => field.name === '_dc_unique_id').value, 'PRIVATE');
    assert.equal(event.payloadFields.find(field => field.name === 'cid').value, 'SECRET');
    assert.equal(event.payloadFields.find(field => field.name === 'ord').value, 'ORDER');
    assert.equal(event.payloadFields.find(field => field.name === '~oref').value, 'https://private.test');
    assert.equal(inspect(prefix+'src=10743458;type=cargu;cat=cargu0').length,0);
  }
});
test('unknown Google paths do not leak path parameters into ID or endpoint', () => {
  const [event] = decodeEvents('https://www.google.com/pagead/conversion/cid=PRIVATE;src=SECRET');
  assert.equal(event.pixelId, 'unknown');
  assert.ok(!/PRIVATE|SECRET/.test(JSON.stringify(event)));
});

test('GA4 recognizes alternate official and first-party collection hosts', () => {
  for (const url of [
    'https://analytics.google.com/g/collect?tid=G-ABC123&en=page_view',
    'https://metrics.example.com/g/collect?tid=G-ABC123&en=page_view',
  ]) {
    const [event] = decodeEvents(url);
    assert.deepEqual([event.platform, event.event, event.pixelId], ['GA4', 'page_view', 'G-ABC123']);
  }
  assert.deepEqual(decodeEvents('https://metrics.example.com/g/collect?tid=OTHER&en=page_view'), []);
});

test('Google Ads recognizes modern collect and user-list endpoints', () => {
  const [collect] = decodeEvents('https://www.google.com/ccm/collect?tid=AW-123456&en=purchase&value=20&currency=USD&gclid=PRIVATE');
  assert.deepEqual([collect.platform, collect.event, collect.pixelId], ['Google Ads', 'purchase', 'AW-123456']);
  assert.equal(collect.payloadFields.find(field => field.name === 'gclid').value, 'PRIVATE');
  const [audience] = decodeEvents('https://www.google.com/pagead/1p-user-list/123456/?random=PRIVATE');
  assert.deepEqual([audience.platform, audience.event, audience.pixelId], ['Google Ads', 'remarketing', '123456']);
  assert.equal(audience.payloadFields.find(field => field.name === 'random').value, 'PRIVATE');
});
