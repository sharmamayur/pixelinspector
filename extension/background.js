import { actionLabels } from './lib/automatic.mjs';
import { decodeEvents, analyze, limitations } from './lib/analyze.mjs';

// Serialize reads and writes, including after a service worker restart.
let queue = Promise.resolve();
function enqueue(work) {
  const result = queue.then(work);
  queue = result.catch(error => console.error('PixelMonitor:', error));
  return result;
}
const now = () => new Date().toISOString();
function normalize(audit) {
  if (audit?.steps && !audit.actions) {
    audit.actions = audit.steps;
    delete audit.steps;
  }
  for (const [index, action] of (audit?.actions || []).entries()) action.id ||= `A${index + 1}`;
  return audit;
}
async function readAll() {
  const stored = await chrome.storage.session.get(['audits', 'audit']);
  const audits = stored.audits || {};
  if (stored.audit?.tabId != null && !audits[stored.audit.tabId]) audits[stored.audit.tabId] = normalize(stored.audit);
  for (const audit of Object.values(audits)) normalize(audit);
  if (stored.audit) {
    await chrome.storage.session.set({ audits });
    await chrome.storage.session.remove('audit');
  }
  return audits;
}
const read = async tabId => (await readAll())[tabId] || null;
async function save(audit) {
  const audits = await readAll();
  audits[audit.tabId] = audit;
  await chrome.storage.session.set({ audits });
}
async function remove(tabId) {
  const audits = await readAll();
  delete audits[tabId];
  await chrome.storage.session.set({ audits });
}
function finishAction(audit) {
  const action = audit.actions.at(-1);
  if (action && !action.endedAt) action.endedAt = now();
}
function replayFor(message) {
  if (['page', 'product'].includes(message.action)) {
    try {
      const url = new URL(message.url);
      if (['http:', 'https:'].includes(url.protocol)) return { type: 'goto', url: `${url.origin}${url.pathname}` };
    } catch {}
  }
  if (['click', 'cart', 'checkout'].includes(message.action)) {
    const allowedRoles = ['button', 'link', 'checkbox', 'radio', 'combobox', 'textbox', 'menuitem', 'option', 'tab', 'switch', 'treeitem'];
    const role = allowedRoles.includes(message.locator?.role) ? message.locator.role : null;
    const name = String(message.locator?.name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const selector = String(message.locator?.selector || '').trim().slice(0, 500);
    const tag = String(message.locator?.tag || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
    if ((role && name) || selector) return { type: 'click', role, name, selector, tag };
  }
  if (message.action === 'form') return { type: 'manual' };
  return null;
}
function pathFor(url) {
  try { return new URL(url).pathname || '/'; }
  catch { return '/'; }
}
function actionName(message, replay, { initial = false } = {}) {
  if (replay?.type === 'goto') {
    const path = pathFor(replay.url);
    if (initial) return `Started on ${path}`;
    if (message.action === 'product') return `Viewed product at ${path}`;
    return `Opened ${path}`;
  }
  if (replay?.type === 'click') {
    const target = replay.name ? `“${replay.name}”` : `<${replay.tag || 'element'}>`;
    return `Clicked ${target}`;
  }
  if (replay?.type === 'manual') return 'Submitted a form';
  return actionLabels[message.action] || 'Browser action';
}
async function badge(tabId, audit) {
  await chrome.action.setBadgeText({ tabId, text: audit?.recording ? 'REC' : '' });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#2563eb' });
}
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  enqueue(async () => {
    const fromContent = Boolean(sender.tab && !sender.url?.startsWith(chrome.runtime.getURL('')));
    const tabId = fromContent ? sender.tab.id : Number(message.tabId);
    if (!Number.isInteger(tabId) || tabId < 0) throw new Error('Select a browser tab first.');
    let audit = await read(tabId);
    if (fromContent) {
      const active = Boolean(audit?.recording && audit.tabId === sender.tab.id && sender.frameId === 0);
      if (message.type === 'observe') return { active };
      if (message.type !== 'activity' || !active || !actionLabels[message.action]) return null;
      if (audit.actions.length >= 250) return null;
      const replay = replayFor(message);
      const previous = audit.actions.at(-1);
      if (replay?.type === 'goto' && previous?.replay?.type === 'goto' && replay.url === previous.replay.url) {
        if (message.action === 'product' && previous.action !== 'product') {
          const oldName = previous.name;
          previous.action = 'product';
          previous.name = actionName(message, replay);
          for (const event of audit.events) {
            if (event.actionId === previous.id || (!event.actionId && event.action === oldName)) {
              event.actionId = previous.id;
              event.action = previous.name;
            }
          }
          audit.findings = analyze(audit.actions, audit.events, { live: true });
          await save(audit);
        }
        if (audit.notice) {
          audit.notice = '';
          await save(audit);
        }
        return null;
      }
      finishAction(audit);
      audit.actions.push({ id: `A${audit.actions.length + 1}`, name: actionName(message, replay), action: message.action, automatic: true, startedAt: now(), expect: [], replay });
      audit.findings = analyze(audit.actions, audit.events, { live: true });
      await save(audit);
      return null;
    }
    if (message.type === 'get') {
      if (audit) audit.findings = analyze(audit.actions, audit.events, { live: true, endTime: audit.endedAt ? Date.parse(audit.endedAt) : Date.now() });
      return audit;
    }
    if (message.type === 'start') {
      if (audit) throw new Error('Clear the current session before starting a new one.');
      const tab = await chrome.tabs.get(tabId);
      const url = new URL(message.url || tab.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Open a regular website tab first.');
      const startedAt = now();
      const replay = { type: 'goto', url: `${url.origin}${url.pathname}` };
      audit = { tabId, site: url.origin, browser: navigator.userAgent, startedAt, consent: 'Not recorded', recording: true, actions: [{ id: 'A1', name: actionName({ action: 'page' }, replay, { initial: true }), action: 'page', automatic: true, startedAt, expect: [], replay }], events: [], limitations };
    } else if (message.type === 'clear') {
      await remove(tabId);
      await chrome.tabs.sendMessage(tabId, { type: 'observe-stop' }).catch(() => {});
      await badge(tabId, null);
      return null;
    } else {
      if (!audit) throw new Error('Start a recording first.');
      if (message.type === 'stop') {
        audit.recording = false;
        finishAction(audit);
        audit.endedAt = now();
      } else if (message.type === 'resume') {
        audit.recording = true;
        delete audit.endedAt;
      } else if (message.type === 'consent') audit.consent = String(message.value || 'Not recorded').slice(0, 500);
      else throw new Error('Unknown command.');
    }
    audit.findings = analyze(audit.actions, audit.events, { live: true });
    await save(audit);
    await badge(tabId, audit);
    if (message.type === 'start' || message.type === 'resume') {
      await chrome.tabs.sendMessage(audit.tabId, { type: 'observe-start' }).catch(async () => {
        await chrome.scripting.executeScript({ target: { tabId: audit.tabId }, files: ['observer.js'] });
        await chrome.tabs.sendMessage(audit.tabId, { type: 'observe-start' });
      });
    } else if (message.type === 'stop') await chrome.tabs.sendMessage(audit.tabId, { type: 'observe-stop' }).catch(() => {});
    return audit;
  }).then(audit => respond(message.type === 'observe' ? audit : { audit }), error => respond({ error: error.message }));
  return true;
});
const filter = { urls: ['http://*/*', 'https://*/*'] };
chrome.webRequest.onBeforeRequest.addListener(details => {
  if (details.tabId < 0) return;
  enqueue(async () => {
    const audit = await read(details.tabId);
    if (!audit?.recording) return;
    // Decode request data only for a tab with an active inspection session.
    let body = '';
    if (details.requestBody?.formData) {
      const params = new URLSearchParams();
      for (const [key, values] of Object.entries(details.requestBody.formData)) for (const value of values) params.append(key, value);
      body = params.toString();
    } else if (details.requestBody?.raw) {
      const decoder = new TextDecoder();
      body = details.requestBody.raw.map(part => part.bytes ? decoder.decode(part.bytes, { stream: true }) : '').join('') + decoder.decode();
    }
    const decoded = decodeEvents(details.url, body);
    if (!decoded.length) return;
    if (audit.events.length + decoded.length > 1000) {
      audit.recording = false;
      audit.notice = 'Session paused at the 1,000-event limit. Clear it before starting another.';
      finishAction(audit);
      audit.endedAt = now();
      audit.findings = analyze(audit.actions, audit.events);
      await save(audit);
      await badge(details.tabId, audit);
      return;
    }
    const currentAction = audit.actions.at(-1);
    for (const event of decoded) audit.events.push({ ...event, id: `E${audit.events.length + 1}`, requestId: details.requestId, actionId: currentAction.id, action: currentAction.name, at: new Date(details.timeStamp).toISOString() });
    audit.findings = analyze(audit.actions, audit.events, { live: true });
    await save(audit);
  });
}, filter, ['requestBody']);
function complete(details, failed = false) {
  enqueue(async () => {
    const audit = await read(details.tabId);
    if (!audit) return;
    const matches = audit.events.filter(e => e.requestId === details.requestId);
    if (!matches.length) return;
    for (const event of matches) {
      if (failed) {
        event.failed = true;
        event.failureReason = String(details.error || 'Unknown browser network error').slice(0, 120);
      }
      else event.status = details.statusCode;
    }
    audit.findings = analyze(audit.actions, audit.events, { live: true });
    await save(audit);
  });
}
chrome.webRequest.onCompleted.addListener(details => complete(details), filter);
chrome.webRequest.onErrorOccurred.addListener(details => complete(details, true), filter);
chrome.tabs.onRemoved.addListener(tabId => enqueue(async () => {
  if (await read(tabId)) await remove(tabId);
}));
