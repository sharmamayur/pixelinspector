import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeEvents } from './analyze.mjs';

const one = (url, body = '') => {
  const events = decodeEvents(url, body);
  assert.equal(events.length, 1);
  return events[0];
};

test('TikTok JSON retains interpreted fields and the full payload', () => {
  const event = one('https://analytics.tiktok.com/api/v2/pixel/', JSON.stringify({
    pixel_code: 'TT-123', event: 'CompletePayment', event_id: 'ORDER-PRIVATE',
    properties: { value: 25, currency: 'USD', order_id: 'PRIVATE', email: 'person@example.com' },
  }));
  assert.deepEqual([event.platform, event.event, event.pixelId, event.value, event.currency], ['TikTok', 'CompletePayment', 'TT-123', '25', 'USD']);
  assert.equal(event.hasTransactionId, true);
  assert.equal(event.payloadFields.find(field => field.name === 'event_id').value, 'ORDER-PRIVATE');
  assert.equal(event.payloadFields.find(field => field.name === 'properties.email').value, 'person@example.com');
});

test('TikTok activity endpoint is recognized', () => {
  const event = one('https://analytics.tiktok.com/api/v2/pixel/act', JSON.stringify({ pixel_code: 'TT-456', event: 'PageView' }));
  assert.deepEqual([event.platform, event.event, event.pixelId], ['TikTok', 'PageView', 'TT-456']);
});

test('TikTok reads the destination from context.pixel.code', () => {
  const event = one('https://analytics.tiktok.com/api/v2/pixel', JSON.stringify({
    event: 'Purchase',
    context: { pixel: { code: 'CPIXEL123', runtime: '1' } },
    properties: { value: 42, currency: 'USD' },
  }));
  assert.deepEqual([event.platform, event.event, event.pixelId, event.value, event.currency], ['TikTok', 'Purchase', 'CPIXEL123', '42', 'USD']);
  assert.ok(event.payloadFields.some(field => field.name === 'context.pixel.code' && field.value === 'CPIXEL123'));
});

test('TikTok automatic activity uses its page trigger and nested pixel code', () => {
  const event = one('https://analytics.tiktok.com/api/v2/pixel/act', JSON.stringify({
    action: 'Metadata',
    context: { pixel: { code: 'CPIXEL456', codes: 'CPIXEL456|CPIXEL789' } },
    auto_collected_properties: { page_trigger: 'PageView' },
  }));
  assert.deepEqual([event.event, event.pixelId], ['Auto PageView', 'CPIXEL456']);
  assert.match(event.classificationNote, /automatic activity/);
});

test('TikTok supports batched data payloads and ignores its configuration bootstrap', () => {
  const event = one('https://analytics.tiktok.com/api/v2/pixel/act?sdkid=CFALLBACK', JSON.stringify({
    data: [{ event_name: 'AddToCart', context: { pixel: { code: 'CBATCHED' } }, properties: { content_id: 'SKU-1' } }],
  }));
  assert.deepEqual([event.event, event.pixelId], ['AddToCart', 'CBATCHED']);
  const arrayEvent = one('https://analytics.tiktok.com/api/v2/pixel', JSON.stringify([
    { event: 'ViewContent', context: { pixel: { code: 'CARRAY' } } },
  ]));
  assert.deepEqual([arrayEvent.event, arrayEvent.pixelId], ['ViewContent', 'CARRAY']);
  assert.deepEqual(decodeEvents('https://analytics.tiktok.com/api/v2/pixel?sdkid=CCONFIG&lib=ttq'), []);
});

test('Pinterest parses commerce metadata and retains payload fields', () => {
  const event = one('https://ct.pinterest.com/v3/?tid=123&event=checkout&ed[value]=10&ed[currency]=USD&ed[product_id]=SKU&ed[event_id]=PRIVATE&url=https://private.test');
  assert.deepEqual([event.platform, event.event, event.pixelId], ['Pinterest', 'checkout', '123']);
  assert.equal(event.hasProductId, true);
  assert.equal(event.payloadFields.find(field => field.name === 'ed[event_id]').value, 'PRIVATE');
  assert.equal(event.payloadFields.find(field => field.name === 'url').value, 'https://private.test');
});

test('LinkedIn distinguishes page views and conversions', () => {
  assert.equal(one('https://px.ads.linkedin.com/collect/?pid=123&fmt=gif').event, 'PageView');
  const conversion = one('https://px.ads.linkedin.com/collect/?pid=123&conversionId=456&url=https://private.test');
  assert.deepEqual([conversion.platform, conversion.event, conversion.conversionId], ['LinkedIn', 'Conversion', '456']);
  assert.equal(conversion.payloadFields.find(field => field.name === 'url').value, 'https://private.test');
});

test('Snapchat interprets known fields and retains the complete payload', () => {
  const event = one('https://tr.snapchat.com/p?pid=abc&ev=PURCHASE&price=5&currency=USD&transaction_id=PRIVATE&u_em=PRIVATE');
  assert.deepEqual([event.platform, event.event, event.value], ['Snapchat', 'PURCHASE', '5']);
  assert.equal(event.hasTransactionId, true);
  assert.equal(event.payloadFields.find(field => field.name === 'transaction_id').value, 'PRIVATE');
  assert.equal(event.payloadFields.find(field => field.name === 'u_em').value, 'PRIVATE');
});

test('Microsoft UET identifies page and commerce events', () => {
  assert.equal(one('https://bat.bing.com/action/0?ti=123&evt=pageLoad').event, 'PageView');
  const purchase = one('https://bat.bing.com/action/0?ti=123&evt=custom&ea=purchase&gv=9.5&gc=USD&mid=PRIVATE');
  assert.deepEqual([purchase.platform, purchase.event, purchase.pixelId, purchase.value], ['Microsoft Ads', 'purchase', '123', '9.5']);
  assert.equal(purchase.payloadFields.find(field => field.name === 'mid').value, 'PRIVATE');
});

test('Reddit, X and Adobe requests are classified conservatively', () => {
  assert.equal(one('https://alb.reddit.com/snoo.gif?id=abc&event=PageVisit&uuid=PRIVATE').platform, 'Reddit Ads');
  assert.deepEqual([one('https://analytics.twitter.com/i/adsct?txn_id=tw-o6ou1-o9l96').platform,
    one('https://analytics.twitter.com/i/adsct?txn_id=tw-o6ou1-o9l96').pixelId], ['X Ads', 'o6ou1']);
  const adobe = one('https://brand.sc.omtrdc.net/b/ss/report-suite/1?events=event1&aid=PRIVATE');
  assert.deepEqual([adobe.platform, adobe.pixelId], ['Adobe Analytics', 'report-suite']);
  assert.equal(adobe.payloadFields.find(field => field.name === 'aid').value, 'PRIVATE');
});

test('Criteo, Taboola and Outbrain retain complete payload fields', () => {
  const cases = [
    ['https://widget.us.criteo.com/event?account=123&event=viewHome&uid=PRIVATE', 'Criteo'],
    ['https://trc.taboola.com/123/log/3/unip/?en=page_view&user=PRIVATE', 'Taboola'],
    ['https://tr.outbrain.com/obtpixel.gif?obtp=789&name=PAGE_VIEW&uid=PRIVATE', 'Outbrain'],
  ];
  for (const [url, platform] of cases) {
    const event = one(url);
    assert.equal(event.platform, platform);
    if (platform === 'Taboola') assert.deepEqual([event.pixelId, event.event], ['123', 'page_view']);
    assert.ok(event.payloadFields.some(field => field.value === 'PRIVATE'));
  }
});

test('script loads and near-match domains are ignored', () => {
  for (const url of [
    'https://analytics.tiktok.com/i18n/pixel/events.js',
    'https://ct.pinterest.com.evil.test/v3/?tid=123',
    'https://px.ads.linkedin.com/collect/script.js',
    'https://bat.bing.com/bat.js',
  ]) assert.deepEqual(decodeEvents(url), []);
});
