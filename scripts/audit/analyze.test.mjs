import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeEvents, analyze, reportHtml } from './analyze.mjs';
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
