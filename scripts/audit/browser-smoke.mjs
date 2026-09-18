import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { decodeEvents, analyze } from './analyze.mjs';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext();
  await context.route('https://audit-fixture.test/**', r => r.fulfill({ contentType: 'text/html', body: `<button onclick="fetch('https://www.facebook.com/tr/?id=123&ev=AddToCart',{mode:'no-cors'})">Add to cart</button>` }));
  await context.route('https://www.facebook.com/**', r => r.fulfill({ status: 200, body: 'ok' }));
  const events = [];
  context.on('request', r => events.push(...decodeEvents(r.url(), r.postData() || '')));
  const page = await context.newPage();
  await page.goto('https://audit-fixture.test');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.waitForTimeout(500);
  assert.equal(events[0].event, 'AddToCart');
  assert.equal(analyze([{ name: 'cart', expect: [{ platform: 'Meta', event: 'AddToCart' }] }], events.map(e => ({ ...e, step: 'cart' }))).length, 0);
  console.log('Browser smoke test passed: click → request capture → analysis. All traffic mocked.');
} finally { await browser.close(); }
