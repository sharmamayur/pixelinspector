import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeEvents, failureLabel, reportHtml } from './analyze.mjs';
test('Meta event parsing retains the complete request payload', () => {
  const events = decodeEvents('https://www.facebook.com/tr/?id=123&ev=Purchase&cd[value]=0&cd[currency]=USD&ud[email]=secret&dl=https://store.test/private');
  assert.equal(events[0].value, '0');
  assert.equal(events[0].platform, 'Meta');
  assert.equal(events[0].payloadFields.find(field => field.name === 'ud[email]').value, 'secret');
  assert.equal(events[0].payloadFields.find(field => field.name === 'dl').value, 'https://store.test/private');
  assert.ok(events[0].payloadFields.some(field => field.name === 'id' && field.value === '123'));
});
test('GA4 batches and POST payloads preserve separate events', () => {
  const events = decodeEvents('https://region1.google-analytics.com/g/collect?v=2&tid=G-123', 'en=page_view\nen=purchase&epn.value=12&cu=USD&ep.transaction_id=order');
  assert.equal(events.length, 2);
  assert.equal(events[1].hasTransactionId, true);
  assert.equal(events[1].currency, 'USD');
});
test('script loads and lookalike hosts are not events', () => {
  assert.deepEqual(decodeEvents('https://connect.facebook.net/en_US/fbevents.js'), []);
  assert.deepEqual(decodeEvents('https://google-analytics.com.evil.test/g/collect?en=purchase'), []);
});
test('browser failures are labeled by their Chrome reason', () => {
  assert.equal(failureLabel('net::ERR_BLOCKED_BY_CLIENT'), 'Blocked by the browser or an extension');
  assert.equal(failureLabel('net::ERR_ABORTED'), 'Canceled by the browser');
  assert.equal(failureLabel('net::ERR_TIMED_OUT'), 'Browser network failure (net::ERR_TIMED_OUT)');
  const html = reportHtml({site:'test',steps:[],events:[{id:'E1',platform:'Meta',event:'Lead',pixelId:'123',failed:true,failureReason:'net::ERR_BLOCKED_BY_CLIENT'}]});
  assert.match(html,/Blocked by the browser or an extension/);
});
test('report escapes website-controlled content', () => {
  const html = reportHtml({site:'<script>alert(1)</script>',steps:[],events:[]});
  assert.ok(!html.includes('<script>'));
});

test('Meta names are classified as standard or custom with exact capitalization', () => {
  const standard = ['PageView', 'AddPaymentInfo', 'AddToCart', 'AddToWishlist', 'CompleteRegistration', 'Contact', 'CustomizeProduct', 'Donate', 'FindLocation', 'InitiateCheckout', 'Lead', 'Purchase', 'Schedule', 'Search', 'StartTrial', 'SubmitApplication', 'Subscribe', 'ViewContent'];
  for (const name of standard) {
    const [event] = decodeEvents(`https://www.facebook.com/tr/?id=123&ev=${name}`);
    assert.equal(event.eventType, 'standard', name);
  }
  for (const name of ['NewsletterSignup', 'purchase', 'PURCHASE', 'Pageview', 'PurchaseComplete']) {
    const [event] = decodeEvents(`https://www.facebook.com/tr/?id=123&ev=${name}`);
    assert.equal(event.eventType, 'custom', name);
    assert.equal(event.event, name);
  }
  assert.equal(decodeEvents('https://www.google-analytics.com/g/collect?tid=G-ABC&en=Purchase')[0].eventType, undefined);
});
