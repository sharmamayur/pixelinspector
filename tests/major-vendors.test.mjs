import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeEvents } from '../extension/lib/analyze.mjs';
import { prettyJson } from '../extension/lib/payload-fields.mjs';

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

test('X Ads identifies bare tag IDs and event codes across GET and POST endpoints', () => {
  for (const host of ['analytics.twitter.com', 'analytics.x.com', 't.co']) {
    for (const path of ['/i/adsct', '/1/i/adsct', '/i/adsctp', '/1/i/adsctp']) {
      for (const [transaction, pixelId, name] of [
        ['o6ou1', 'o6ou1', 'PageView'],
        ['tw-o6ou1-o9l96', 'o6ou1', 'Event o9l96'],
      ]) {
        const body = new URLSearchParams({ txn_id: transaction }).toString();
        for (const event of [one(`https://${host}${path}?${body}`), one(`https://${host}${path}`, body)]) {
          assert.deepEqual([event.platform, event.pixelId, event.event], ['X Ads', pixelId, name]);
          assert.equal(event.payloadFields.find(field => field.name === 'txn_id').value, transaction);
        }
      }
    }
  }
  assert.equal(one('https://analytics.twitter.com/i/adsct?pixel_id=explicit').pixelId, 'explicit');
  assert.equal(one('https://analytics.twitter.com/i/adsct').pixelId, 'unknown');
  assert.deepEqual(decodeEvents('https://analytics.twitter.com.evil.test/i/adsct?txn_id=o6ou1'), []);
  assert.deepEqual(decodeEvents('https://static.ads-twitter.com/uwt.js'), []);
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

// Based on the public Snap SDK's /p envelope; identifiers are synthetic.
test('Snapchat JSON batches retain separate events, destinations, and shared context', () => {
  const events = decodeEvents('https://tr.snapchat.com/p', JSON.stringify({
    ctx: { url: 'https://example.test/cart', v: 'test' },
    req: [
      { t: { pid: 'snap-one', ev: 'PAGE_VIEW' }, ts: 1 },
      { md: { pids: ['snap-one'], btx: 'button' } },
      { t: { pid: 'snap-two', ev: 'PURCHASE', price: 0, currency: 'USD', transaction_id: 'test-order' }, ts: 2 },
    ],
  }));
  assert.deepEqual(events.map(e => [e.platform,e.event,e.pixelId]), [['Snapchat','PAGE_VIEW','snap-one'],['Snapchat','PURCHASE','snap-two']]);
  assert.equal(events[1].value, '0');
  assert.equal(events[1].currency, 'USD');
  assert.equal(events[1].hasTransactionId, true);
  assert.ok(events[1].payloadFields.some(f => f.name === 'req[2].t.transaction_id' && f.value === 'test-order'));
  assert.ok(events[0].payloadFields.some(f => f.name === 'ctx.url'));
  assert.ok(!events[0].payloadFields.some(f => f.value === 'test-order'));
});
test('Snapchat supports alternate host, direct JSON, and form POSTs', () => {
  const body = JSON.stringify({req:[{t:{pid:'snap-id',ev:'ADD_CART',price:10,currency:'USD'}}]});
  assert.equal(one('https://tr6.snapchat.com/p',body).pixelId, 'snap-id');
  assert.equal(one('https://tr.snapchat.com/p',JSON.stringify({pid:'snap-id',ev:'PAGE_VIEW'})).event, 'PAGE_VIEW');
  assert.equal(one('https://tr.snapchat.com/p','pid=snap-id&ev=PURCHASE&price=5&currency=USD').value, '5');
});
test('Snapchat ignores diagnostics, preflights, sync, scripts, and lookalike hosts', () => {
  for (const body of ['', '{invalid', JSON.stringify({req:[null,{log:{name:'ERR'}},{pc:{pids:['snap-id']}},{t:{pid:'snap-id'}}]})]) {
    assert.deepEqual(decodeEvents('https://tr.snapchat.com/p',body), []);
  }
  for (const url of ['https://tr.snapchat.com/cm?pid=abc','https://tr.snapchat.com/cm/s?pid=abc','https://sc-static.net/scevent.min.js','https://tr.snapchat.com.evil.test/p?pid=abc&ev=PAGE_VIEW']) {
    assert.deepEqual(decodeEvents(url), []);
  }
});

test('Amplitude batches keep event names, project ID and per-event properties', () => {
  for (const host of ['api.amplitude.com', 'api2.amplitude.com', 'api.eu.amplitude.com']) {
    for (const path of ['/2/httpapi', '/batch']) {
      const events = decodeEvents(`https://${host}${path}`, JSON.stringify({ api_key: 'project-123', events: [
        { event_type: 'Purchase', revenue: 0, event_properties: { currency: 'USD', sku: 'A' } },
        { event_type: '$identify', user_properties: { plan: 'Pro' } }, null, {},
      ] }));
      assert.deepEqual(events.map(e => [e.platform, e.event, e.pixelId]), [['Amplitude', 'Purchase', 'project-123'], ['Amplitude', '$identify', 'project-123']]);
      assert.equal(events[0].value, '0');
      assert.ok(events[0].customFields.some(f => f.name === 'event_properties.sku' && f.value === 'A'));
      assert.ok(!events[1].payloadFields.some(f => f.name === 'event_properties.sku'));
    }
  }
  const form = new URLSearchParams({ client: 'legacy-key', e: JSON.stringify([{ event_type: 'Viewed' }]) });
  assert.equal(one('https://api.amplitude.com/httpapi', form.toString()).pixelId, 'legacy-key');
  assert.equal(one('https://api2.amplitude.com/2/httpapi', JSON.stringify({ events: [{event_type: 'Viewed'}] })).pixelId, 'unknown');
});

test('Snowplow parses first-party collectors, batches and encoded Unicode custom events', () => {
  const custom = { schema: 'iglu:com.snowplowanalytics.snowplow/unstruct_event/jsonschema/1-0-0', data: {
    schema: 'iglu:com.shop/product_view/jsonschema/1-0-0', data: { name: 'Café ☕' },
  } };
  for (const field of ['ue_pr', 'ue_px']) {
    const payload = { schema: 'iglu:com.snowplowanalytics.snowplow/payload_data/jsonschema/1-0-4', data: [
      { e: 'pv', aid: 'store', tv: 'js-4.0.0' },
      { e: 'ue', aid: 'store', [field]: field === 'ue_pr' ? JSON.stringify(custom) : Buffer.from(JSON.stringify(custom)).toString('base64url') },
      { e: 'se', aid: 'other-app', se_ac: 'Clicked', se_ca: 'Button' }, null,
    ] };
    const events = decodeEvents('https://collect.shop.test/custom-path', JSON.stringify(payload));
    assert.deepEqual(events.map(e => [e.event, e.pixelId]), [['PageView', 'store'], ['product_view', 'store'], ['Clicked', 'other-app']]);
    assert.ok(events[1].customFields.some(f => f.value === 'Café ☕'));
    assert.ok(!events[0].payloadFields.some(f => f.name === field));
    assert.deepEqual(events[1].jsonFields, [{ name: field, label: 'Self-describing event', json: JSON.stringify(custom) }]);
    assert.ok(!events[1].payloadFields.some(f => f.name === field || f.name.startsWith('decoded')));
  }
  assert.deepEqual([one('https://collect.shop.test/i?e=pp&tv=js-4.0.0').platform, one('https://collect.shop.test/i?e=pp&tv=js-4.0.0').pixelId], ['Snowplow', 'collect.shop.test']);
  const undecodable = one('https://collect.shop.test/i?e=ue&tv=js-4&ue_px=invalid');
  assert.equal(undecodable.event, 'Self-describing event');
  assert.deepEqual(undecodable.jsonFields, []);
  assert.equal(undecodable.payloadFields.find(f => f.name === 'ue_px').value, 'invalid');
  const contexts = { schema: 'iglu:com.snowplowanalytics.snowplow/contexts/jsonschema/1-0-0', data: [{ schema: 'iglu:com.snowplowanalytics.snowplow/web_page/jsonschema/1-0-0', data: { id: 'page-1', count: 2 } }] };
  const withContexts = one(`https://collect.shop.test/i?e=pv&tv=js-4&cx=${Buffer.from(JSON.stringify(contexts)).toString('base64url')}`);
  assert.deepEqual(withContexts.jsonFields, [{ name: 'cx', label: 'Contexts', json: JSON.stringify(contexts) }]);
  assert.match(prettyJson(withContexts.jsonFields[0].json), /^\{\n  "schema": /);
  assert.equal(prettyJson('{broken'), '{broken');
  assert.deepEqual(withContexts.payloadFields.map(f => f.name), ['e', 'tv']);
  assert.equal(one('https://collect.shop.test/i?e=tr&tv=js-4&tr_tt=0&tr_cu=USD').value, '0');
});

test('analytics parsers ignore scripts, unrelated requests and malformed batches', () => {
  for (const [url, body] of [
    ['https://api2.amplitude.com/2/httpapi', '{broken'],
    ['https://api2.amplitude.com/2/httpapi', '{"events":{}}'],
    ['https://api2.amplitude.com.evil.test/2/httpapi', '{"events":[{"event_type":"Test"}]}'],
    ['https://cdn.amplitude.com/libs/amplitude.js', ''],
    ['https://shop.test/i?e=pv', ''],
    ['https://shop.test/com.snowplowanalytics.snowplow/tp2', '{}'],
  ]) assert.deepEqual(decodeEvents(url, body), []);
});

test('Pinterest requests without an event name are page visits', () => {
  assert.equal(one('https://ct.pinterest.com/v3/?tid=123').event, 'pagevisit');
});

test('Meta Pixel requests through a first-party proxy are recognized by path and parameters', () => {
  const event = one('https://metrics.shop.test/tr/?id=123456789012345&ev=Purchase&cd[value]=10&cd[currency]=USD');
  assert.deepEqual([event.platform, event.event, event.pixelId], ['Meta', 'Purchase', '123456789012345']);
  assert.match(event.classificationNote, /proxy endpoint/);
  assert.equal(decodeEvents('https://www.facebook.com/tr/?id=123&ev=PageView')[0].classificationNote, undefined);
  for (const url of [
    'https://shop.test/tr/?id=abc&ev=PageView',
    'https://shop.test/tr/?id=123456789012345',
    'https://shop.test/track/?id=123456789012345&ev=PageView',
  ]) assert.deepEqual(decodeEvents(url), [], url);
});

test('Amplitude events through a custom server URL are recognized by their JSON body', () => {
  const body = JSON.stringify({ api_key: 'amp-key', events: [{ event_type: 'Viewed', device_id: 'd1' }] });
  const event = one('https://shop.test/amp', body);
  assert.deepEqual([event.platform, event.event, event.pixelId], ['Amplitude', 'Viewed', 'amp-key']);
  assert.match(event.classificationNote, /proxy endpoint/);
  assert.deepEqual(decodeEvents('https://shop.test/amp', JSON.stringify({ api_key: 'k', events: [{ name: 'x' }] })), []);
  assert.deepEqual(decodeEvents('https://shop.test/amp', JSON.stringify({ api_key: 'k', events: [] })), []);
});

test('every vendor with a standard event list labels events standard or custom', () => {
  const type = (url, body) => decodeEvents(url, body)[0].eventType;
  const tiktok = event => JSON.stringify({ event, pixel_code: 'C1', properties: {} });
  const snap = ev => JSON.stringify({ req: [{ t: { pid: 'p', ev } }] });
  const amp = event_type => JSON.stringify({ api_key: 'k', events: [{ event_type }] });
  for (const [url, body, expected] of [
    ['https://www.facebook.com/tr/?id=123&ev=Purchase', '', 'standard'],
    ['https://www.facebook.com/tr/?id=123&ev=NewsletterSignup', '', 'custom'],
    ['https://www.google-analytics.com/g/collect?tid=G-1&en=add_to_cart', '', 'standard'],
    ['https://www.google-analytics.com/g/collect?tid=G-1&en=scroll', '', 'standard'],
    ['https://www.google-analytics.com/g/collect?tid=G-1&en=checkout_step_2', '', 'custom'],
    ['https://analytics.tiktok.com/api/v2/pixel', tiktok('CompletePayment'), 'standard'],
    ['https://analytics.tiktok.com/api/v2/pixel', tiktok('LoyaltyJoin'), 'custom'],
    ['https://ct.pinterest.com/v3/?tid=1&event=AddToCart', '', 'standard'],
    ['https://ct.pinterest.com/v3/?tid=1&event=custom', '', 'custom'],
    ['https://tr.snapchat.com/p', snap('PURCHASE'), 'standard'],
    ['https://tr.snapchat.com/p', snap('CUSTOM_EVENT_1'), 'custom'],
    ['https://alb.reddit.com/snoo.gif?id=1&event=AddToCart', '', 'standard'],
    ['https://alb.reddit.com/snoo.gif?id=1&event=Custom', '', 'custom'],
    ['https://bat.bing.com/action/0?ti=1&evt=pageLoad', '', 'standard'],
    ['https://bat.bing.com/action/0?ti=1&evt=custom&ea=signup', '', 'custom'],
    ['https://api2.amplitude.com/2/httpapi', amp('[Amplitude] Page Viewed'), 'standard'],
    ['https://api2.amplitude.com/2/httpapi', amp('Checkout Started'), 'custom'],
    ['https://c.shop.test/i?e=pv&tv=js-4', '', 'standard'],
  ]) assert.equal(type(url, body), expected, `${url} ${body}`);
  // Vendors whose event names come from account configuration get no label.
  for (const url of [
    'https://px.ads.linkedin.com/collect/?pid=1&conversionId=2',
    'https://analytics.twitter.com/i/adsct?txn_id=tw-abc-def',
    'https://www.googleadservices.com/pagead/conversion/123/?label=ABC',
    'https://ad.doubleclick.net/ddm/activity/src=1;type=a;cat=b',
  ]) assert.equal(decodeEvents(url)[0].eventType, undefined, url);
  assert.equal(decodeEvents('https://analytics.tiktok.com/api/v2/pixel/act', JSON.stringify({ action: 'Metadata', context: { pixel: { code: 'C1' } } }))[0].eventType, undefined);
});

test('Snowplow self-describing events are standard only for Snowplow-authored schemas', () => {
  const ue = schema => one(`https://c.shop.test/i?e=ue&tv=js-4&ue_pr=${encodeURIComponent(JSON.stringify({ schema: 'iglu:com.snowplowanalytics.snowplow/unstruct_event/jsonschema/1-0-0', data: { schema, data: { target: 'x' } } }))}`);
  const own = ue('iglu:com.shop/product_view/jsonschema/1-0-0');
  assert.deepEqual([own.eventType, own.customFields.map(f => f.name), own.standardFields.map(f => f.name)], ['custom', ['target'], []]);
  const builtIn = ue('iglu:com.snowplowanalytics.snowplow/link_click/jsonschema/1-0-1');
  assert.deepEqual([builtIn.eventType, builtIn.customFields.map(f => f.name), builtIn.standardFields.map(f => f.name)], ['standard', [], ['target']]);
  const structured = one('https://c.shop.test/i?e=se&tv=js-4&se_ca=Nav&se_ac=Open');
  assert.deepEqual(structured.standardFields.map(f => f.name), ['se_ca', 'se_ac']);
});

test('payload fields are standard when they are vendor-documented event parameters', () => {
  const names = event => [event.standardFields.map(f => f.name), event.customFields.map(f => f.name)];
  assert.deepEqual(names(one('https://analytics.tiktok.com/api/v2/pixel', JSON.stringify({ event: 'Purchase', pixel_code: 'C1', properties: { value: 5, currency: 'USD', contents: [{ content_id: 'A' }], loyalty: 'gold' } }))),
    [['properties.value', 'properties.currency', 'properties.contents[0].content_id'], ['properties.loyalty']]);
  assert.deepEqual(names(one('https://ct.pinterest.com/v3/?tid=1&event=checkout&ed[value]=5&ed[currency]=USD&ed[line_items][0][product_id]=A&ed[campaign]=x')),
    [['ed[value]', 'ed[currency]', 'ed[line_items][0][product_id]'], ['ed[campaign]']]);
  assert.deepEqual(names(one('https://tr.snapchat.com/p', JSON.stringify({ ctx: { url: 'https://shop.test' }, req: [{ t: { pid: 'p', ev: 'PURCHASE', price: 5, item_ids: ['A', 'B'] } }] }))),
    [['req[0].t.price', 'req[0].t.item_ids[0]', 'req[0].t.item_ids[1]'], []]);
  assert.deepEqual(names(one('https://www.google-analytics.com/g/collect?tid=G-1&en=purchase&cu=USD&epn.value=5&ep.tier=gold&pr1=idA')),
    [['cu', 'epn.value', 'pr1'], ['ep.tier']]);
  assert.deepEqual(names(one('https://api2.amplitude.com/2/httpapi', JSON.stringify({ api_key: 'k', events: [{ event_type: 'Buy', revenue: 5, event_properties: { plan: 'pro' } }] }))),
    [['revenue'], ['event_properties.plan']]);
});

test('Snowplow GET requests are recognized behind path prefixes and on custom collector paths', () => {
  const query = 'e=pv&tv=js-4.1.0&aid=shop&eid=00000000-0000-4000-8000-000000000000&p=web';
  for (const path of ['/sp/i', '/analytics/ice.png', '/collect', '/t']) {
    const event = one(`https://shop.test${path}?${query}`);
    assert.deepEqual([event.platform, event.event, event.pixelId], ['Snowplow', 'PageView', 'shop'], path);
  }
  assert.equal(one('https://shop.test/px?e=pp&tv=js-4&aid=shop').event, 'PagePing');
  // Custom paths need the protocol signature; near-misses are ignored.
  for (const url of [
    'https://shop.test/collect?e=pv&tv=js-4',
    'https://shop.test/collect?e=click&tv=1&eid=x',
    'https://shop.test/collect?e=pv&aid=shop',
  ]) assert.deepEqual(decodeEvents(url), [], url);
});

test('Snowplow batches whose body Chrome cannot expose are recorded as unreadable, not dropped', () => {
  const [batch] = decodeEvents('https://sp.shop.test/com.snowplowanalytics.snowplow/tp2', '', { bodyUnavailable: true });
  assert.deepEqual([batch.platform, batch.event, batch.pixelId, batch.eventType], ['Snowplow', 'Unreadable batch', 'sp.shop.test', undefined]);
  assert.match(batch.classificationNote, /sent as a Blob/);
  assert.deepEqual(decodeEvents('https://sp.shop.test/com.snowplowanalytics.snowplow/tp2', ''), []);
  assert.deepEqual(decodeEvents('https://shop.test/api/save', '', { bodyUnavailable: true }), []);
});
