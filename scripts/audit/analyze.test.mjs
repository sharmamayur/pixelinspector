import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeEvents, analyze, journeyFindings, reportHtml, sessionSummary } from './analyze.mjs';
test('Meta event parsing retains the complete request payload', () => {
  const events = decodeEvents('https://www.facebook.com/tr/?id=123&ev=Purchase&cd[value]=0&cd[currency]=USD&ud[email]=secret&dl=https://store.test/private');
  assert.equal(events[0].value, '0');
  assert.equal(events[0].platform, 'Meta');
  assert.equal(events[0].payloadFields.find(field => field.name === 'ud[email]').value, 'secret');
  assert.equal(events[0].payloadFields.find(field => field.name === 'dl').value, 'https://store.test/private');
  assert.ok(events[0].payloadFields.some(field => field.name === 'id' && field.value === '123'));
  assert.equal(analyze([{name:'buy'}], events.map(e=>({...e,step:'buy'}))).length,0);
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
test('absence requires explicit expectation and is suppressed for failed steps', () => {
  const step = {name:'cart',expect:[{platform:'Meta',event:'AddToCart'}]};
  assert.match(analyze([step],[])[0].text,/not observed/);
  assert.equal(analyze([{name:'cart'}],[]).length,0);
  assert.doesNotMatch(analyze([{...step,error:'Timeout'}],[])[0].text,/was not observed/);
});
test('purchase payload and HTTP failures cite evidence', () => {
  const findings = analyze([{name:'buy'}],[{step:'buy',id:'E1',platform:'Meta',pixelId:'123',event:'Purchase',value:null,currency:null,status:500}]);
  assert.equal(findings.length,2);
  assert.deepEqual(findings[0].evidence,['E1']);
  assert.equal(findings[0].severity,'error');
});
test('browser delivery failures explain the captured Chrome reason', () => {
  const [finding] = analyze([{name:'click'}],[{action:'click',id:'E1',platform:'Meta',pixelId:'123',event:'SubscribedButtonClick',failed:true,failureReason:'net::ERR_BLOCKED_BY_CLIENT'}]);
  assert.match(finding.text,/blocked on this device/);
  assert.match(finding.fix,/ad blocker or privacy extension/);
  assert.match(finding.text,/destination 123/);
});
test('events are associated by stable action ID when labels repeat', () => {
  const actions = [
    {id:'A1',name:'Clicked “Continue”',expect:[{platform:'Meta',event:'First'}]},
    {id:'A2',name:'Clicked “Continue”',expect:[{platform:'Meta',event:'Second'}]},
  ];
  const events = [{actionId:'A2',action:'Clicked “Continue”',id:'E1',platform:'Meta',pixelId:'123',event:'Second'}];
  const findings = analyze(actions,events);
  assert.equal(findings.filter(f => f.code === 'event.not_observed').length,1);
  assert.match(findings[0].text,/First/);
});
test('report escapes website-controlled content', () => {
  const html = reportHtml({site:'<script>alert(1)</script>',steps:[],events:[],findings:[]});
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
test('journey findings keep delivery notes by action and leave payload rules to best-practice checks', () => {
  const notes = journeyFindings([{id:'A1',name:'buy'}],[{actionId:'A1',action:'buy',id:'E1',platform:'Meta',pixelId:'123',event:'Purchase',value:null,currency:null,status:500}]);
  assert.deepEqual(notes.map(n => [n.code, n.actionId]), [['request.delivery','A1']]);
});
test('exports include journey notes', () => {
  const report = {site:'https://shop.test',startedAt:'2026-09-28T12:00:00Z',consent:'Not recorded',steps:[],events:[],
    journeyFindings:[{code:'request.delivery',action:'Clicked “Buy”',evidence:['E1'],text:'Meta Purchase <b>returned HTTP 500</b>.',fix:'Check vendor diagnostics.'}]};
  const html = reportHtml(report);
  assert.match(html,/Delivery and journey notes/);
  assert.match(html,/Delivery<\/b> · Clicked “Buy” · E1/);
  assert.doesNotMatch(html,/<b>returned/);
  assert.match(sessionSummary(report),/Delivery · Clicked “Buy”: Meta Purchase/);
  assert.match(sessionSummary({...report,journeyFindings:[]}),/No delivery failures or missing events were noted/);
});
