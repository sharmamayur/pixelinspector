import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { decodeEvents, analyze, reportHtml, sessionSummary, limitations } from './analyze.mjs';

const args = process.argv.slice(2);
if (!args[0] || args.includes('--help')) {
  console.log('Usage: node scripts/audit/run.mjs <https://site> [--config journey.json] [--out directory] [--headless]\nWithout config, walk through the browser and mark each step in the terminal.');
  process.exit(0);
}
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const url = new URL(args[0]);
if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP(S) URL without credentials.');
const config = option('--config') ? JSON.parse(await readFile(option('--config'), 'utf8')) : null;
if (args.includes('--headless') && !config) throw new Error('--headless requires --config');
if (config && (!Array.isArray(config.steps) || !config.steps.length || new Set(config.steps.map(s => s.name)).size !== config.steps.length || config.steps.some(s => !s.name || !['goto','click','wait'].includes(s.action)))) throw new Error('Config needs unique named steps with goto, click, or wait actions.');
const out = resolve(option('--out') || `audit-output/${url.hostname}-${Date.now()}`);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: args.includes('--headless'), ...(option('--channel') ? { channel: option('--channel') } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const report = { site: url.origin, startedAt: new Date().toISOString(), browser: `Chromium ${browser.version()}`, consent: config?.consent || 'Not recorded', limitations, steps: [], events: [], findings: [] };
let currentStep;
const requests = new Map();
context.on('request', request => {
  if (!currentStep) return;
  const events = decodeEvents(request.url(), request.postData() || '').map(e => ({ ...e, id: `E${report.events.length + 1}`, step: currentStep.name, at: new Date().toISOString() }));
  // Assign distinct IDs to batched events too.
  events.forEach((e, i) => { e.id = `E${report.events.length + i + 1}`; });
  if (events.length) { requests.set(request, events); report.events.push(...events); }
});
context.on('response', response => { for (const e of requests.get(response.request()) || []) e.status = response.status(); });
context.on('requestfailed', request => { for (const e of requests.get(request) || []) e.failed = true; });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const terminal = config ? null : createInterface({ input: process.stdin, output: process.stdout });
async function stepRun(step, action) {
  currentStep = { name: step.name, expect: step.expect || [], startedAt: new Date().toISOString() };
  report.steps.push(currentStep);
  try {
    await action();
    await page.waitForTimeout(Math.min(Math.max(Number(step.waitMs) || 3000, 500), 30000));
    currentStep.screenshot = `step-${report.steps.length}.png`;
    await page.screenshot({ path: resolve(out, currentStep.screenshot) });
  } catch (error) {
    currentStep.error = `${error.name}: step action or capture failed`;
    console.error(`Step failed: ${step.name} (${error.name})`);
    delete currentStep.screenshot;
  }
  currentStep.endedAt = new Date().toISOString();
  const failed = Boolean(currentStep.error);
  currentStep = null;
  return !failed;
}
try {
  if (config) {
    for (const step of config.steps) {
      const ok = await stepRun(step, async () => {
        if (step.action === 'goto') {
          const destination = new URL(step.url || url.href, url);
          if (!['http:', 'https:'].includes(destination.protocol)) throw new Error('Invalid navigation protocol');
          const response = await page.goto(destination.href, { waitUntil: 'domcontentloaded' });
          if (response && response.status() >= 400) throw new Error('Navigation failed');
        } else if (step.action === 'click') await page.locator(step.selector).click();
      });
      if (!ok) break;
    }
  } else {
    await stepRun({ name: 'Initial page load' }, () => page.goto(url.href, { waitUntil: 'domcontentloaded' }));
    console.log('Enter a step name BEFORE performing that action in the browser. Type done to finish.');
    for (;;) {
      const name = (await terminal.question('Next step name (or done): ')).trim();
      if (name === 'done') break;
      if (!name || report.steps.some(s => s.name === name)) { console.log('Use a unique nonempty step name.'); continue; }
      await stepRun({ name }, () => terminal.question('Perform this step in the browser, then press Enter here.'));
    }
    report.consent = (await terminal.question('What consent choice did you make, and at which step? ')).trim() || 'Not recorded';
  }
} finally {
  terminal?.close();
  await browser.close();
  report.findings = analyze(report.steps, report.events);
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(resolve(out, 'report.html'), reportHtml(report));
  await writeFile(resolve(out, 'summary.txt'), sessionSummary(report));
  console.log(`Saved ${report.events.length} events and ${report.findings.length} potential findings to ${out}`);
}
if (report.steps.some(s => s.error)) process.exitCode = 1;
