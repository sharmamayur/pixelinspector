import { decodeEvents, limitations } from './lib/analyze.mjs';

// Serialize reads and writes, including after a service worker restart.
let queue = Promise.resolve();
function enqueue(work) {
  const result = queue.then(work);
  queue = result.catch(error => console.error('PixelMonitor:', error));
  return result;
}
const actionLabels = { page: 'Page viewed', product: 'Product viewed', click: 'Element clicked', cart: 'Add to cart clicked', checkout: 'Checkout clicked', form: 'Form submitted' };
const now = () => new Date().toISOString();
// Sessions live in memory while the worker runs and are written to storage, one key per
// tab, shortly after they change. Storage restores them after a worker restart.
const storageKey = tabId => `audit:${tabId}`;
const sessions = new Map();
// Approximate stored size per tab, as Chrome counts it: the key plus the JSON value in UTF-8.
// Stored bytes are confirmed by a successful write; pending bytes estimate what captures
// have added in memory since then.
const storedBytes = new Map();
const pendingBytes = new Map();
const jsonBytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
const sizeOf = (tabId, audit) => new TextEncoder().encode(storageKey(tabId)).length + jsonBytes(audit);
const projectedBytes = tabId => (storedBytes.get(tabId) || 0) + (pendingBytes.get(tabId) || 0);
const otherBytes = tabId => [...sessions.keys()].reduce((total, id) => id === tabId ? total : total + projectedBytes(id), 0);
// Leave headroom below Chrome's session storage quota (10 MB) for actions and response
// statuses, which are not checked individually.
const STORAGE_BUDGET = Math.floor((chrome.storage.session.QUOTA_BYTES || 10485760) * 0.9);
const STORAGE_NOTICE = 'Session paused because Chrome’s extension storage is nearly full. Export it if needed, then Clear this or another tab’s session.';
let loaded = null;
let ready = false;
function load() {
  loaded ||= chrome.storage.session.get(null).then(stored => {
    for (const [key, audit] of Object.entries(stored)) {
      if (!key.startsWith('audit:') || sessions.has(audit.tabId)) continue;
      sessions.set(audit.tabId, audit);
      storedBytes.set(audit.tabId, sizeOf(audit.tabId, audit));
    }
    ready = true;
  });
  return loaded;
}
const read = async tabId => (await load(), sessions.get(tabId) || null);
const unsaved = new Set();
let flushTimer = null;
async function flush() {
  clearTimeout(flushTimer);
  flushTimer = null;
  const items = {};
  const sizes = new Map();
  const paused = [];
  for (const tabId of unsaved) {
    const audit = sessions.get(tabId);
    if (!audit) continue;
    // Captures are checked as they arrive; this catches other growth before it is written.
    if (audit.recording && otherBytes(tabId) + sizeOf(tabId, audit) > STORAGE_BUDGET) {
      pause(audit, STORAGE_NOTICE);
      paused.push(audit);
    }
    items[storageKey(tabId)] = audit;
    sizes.set(tabId, sizeOf(tabId, audit));
  }
  unsaved.clear();
  try {
    await chrome.storage.session.set(items);
    for (const [tabId, bytes] of sizes) {
      storedBytes.set(tabId, bytes);
      pendingBytes.delete(tabId);
    }
  } catch (error) {
    for (const [tabId, bytes] of sizes) pendingBytes.set(tabId, bytes - (storedBytes.get(tabId) || 0));
    // The write was rejected, so storage and the panel's view are stale. Keep the session in
    // memory, stop capturing, and ask the panel to fetch it directly.
    console.error('PixelMonitor: session storage write failed', error);
    for (const key of Object.keys(items)) {
      const audit = sessions.get(Number(key.slice('audit:'.length)));
      if (audit?.recording) {
        pause(audit, STORAGE_NOTICE);
        paused.push(audit);
      }
      chrome.runtime.sendMessage({ type: 'session-changed', tabId: audit?.tabId }).catch(() => {});
    }
  }
  for (const audit of new Set(paused)) await stopCapture(audit);
}
// Captures are batched so a burst of requests costs one write; commands save immediately.
async function save(audit, { immediate = false } = {}) {
  await load();
  sessions.set(audit.tabId, audit);
  unsaved.add(audit.tabId);
  if (immediate) return flush();
  flushTimer ??= setTimeout(() => enqueue(flush), 250);
}
async function remove(tabId) {
  await load();
  sessions.delete(tabId);
  storedBytes.delete(tabId);
  pendingBytes.delete(tabId);
  unsaved.delete(tabId);
  await chrome.storage.session.remove(storageKey(tabId));
}
// Panel commands that are queued but not yet applied; requests for these tabs are not skipped.
const pendingStarts = new Set();
const recording = tabId => !ready || pendingStarts.has(tabId) || Boolean(sessions.get(tabId)?.recording);
const MAX_EVENTS = 1000;
const MAX_ACTIONS = 250;
function pause(audit, notice) {
  audit.recording = false;
  audit.notice = notice;
  finishAction(audit);
  audit.endedAt = now();
}
async function stopCapture(audit) {
  await badge(audit.tabId, audit);
  await chrome.tabs.sendMessage(audit.tabId, { type: 'observe-stop' }).catch(() => {});
}
async function pauseAtLimit(audit, notice) {
  pause(audit, notice);
  await save(audit, { immediate: true });
  await stopCapture(audit);
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
  const fromContent = Boolean(sender.tab && !sender.url?.startsWith(chrome.runtime.getURL('')));
  const starting = !fromContent && ['start', 'resume'].includes(message.type) ? Number(message.tabId) : null;
  if (starting != null) pendingStarts.add(starting);
  enqueue(async () => {
    const tabId = fromContent ? sender.tab.id : Number(message.tabId);
    if (!Number.isInteger(tabId) || tabId < 0) throw new Error('Select a browser tab first.');
    let audit = await read(tabId);
    if (fromContent) {
      const active = Boolean(audit?.recording && audit.tabId === sender.tab.id && sender.frameId === 0);
      if (message.type === 'observe') return { active };
      if (message.type !== 'activity' || !active || !actionLabels[message.action]) return null;
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
          await save(audit);
        }
        if (audit.notice) {
          audit.notice = '';
          await save(audit);
        }
        return null;
      }
      if (audit.actions.length >= MAX_ACTIONS) {
        await pauseAtLimit(audit, `Session paused at the ${MAX_ACTIONS}-action limit. Export it if needed, then Clear to start a new one.`);
        return null;
      }
      finishAction(audit);
      audit.actions.push({ id: `A${audit.actions.length + 1}`, name: actionName(message, replay), action: message.action, startedAt: now(), replay });
      await save(audit);
      return null;
    }
    if (message.type === 'get') return audit;
    if (message.type === 'start') {
      if (audit) throw new Error('Clear the current session before starting a new one.');
      const tab = await chrome.tabs.get(tabId);
      const url = new URL(message.url || tab.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Open a regular website tab first.');
      const startedAt = now();
      const replay = { type: 'goto', url: `${url.origin}${url.pathname}` };
      audit = { tabId, site: url.origin, browser: navigator.userAgent, startedAt, recording: true, actions: [{ id: 'A1', name: actionName({ action: 'page' }, replay, { initial: true }), action: 'page', startedAt, replay }], events: [], limitations };
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
      } else throw new Error('Unknown command.');
    }
    await save(audit, { immediate: true });
    await badge(tabId, audit);
    if (message.type === 'start' || message.type === 'resume') {
      await chrome.tabs.sendMessage(audit.tabId, { type: 'observe-start' }).catch(async () => {
        await chrome.scripting.executeScript({ target: { tabId: audit.tabId }, files: ['observer.js'] });
        await chrome.tabs.sendMessage(audit.tabId, { type: 'observe-start' });
      });
    } else if (message.type === 'stop') await chrome.tabs.sendMessage(audit.tabId, { type: 'observe-stop' }).catch(() => {});
    return audit;
  }).finally(() => pendingStarts.delete(starting))
    .then(audit => respond(message.type === 'observe' ? audit : { audit }), error => respond({ error: error.message }));
  return true;
});
const filter = { urls: ['http://*/*', 'https://*/*'] };
// Requests made by a site's service worker have no tab. Attribute one to a recording tab
// only when exactly one such tab is currently on the worker's origin.
const workerRequests = new Map();
function currentOrigin(audit) {
  try { return new URL(audit.actions.findLast(action => action.replay?.type === 'goto')?.replay.url || audit.site).origin; }
  catch { return null; }
}
function workerTab(details) {
  if (!details.initiator) return null;
  const matches = [...sessions.values()].filter(audit => audit.recording && currentOrigin(audit) === details.initiator);
  return matches.length === 1 ? matches[0].tabId : null;
}
chrome.webRequest.onBeforeRequest.addListener(details => {
  if (details.tabId >= 0 ? !recording(details.tabId) : ready && workerTab(details) == null) return;
  enqueue(async () => {
    const fromWorker = details.tabId < 0;
    const tabId = fromWorker ? (await load(), workerTab(details)) : details.tabId;
    if (tabId == null) return;
    const audit = await read(tabId);
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
    const decoded = decodeEvents(details.url, body, { bodyUnavailable: Boolean(details.requestBody?.error) });
    if (!decoded.length) return;
    if (audit.events.length + decoded.length > MAX_EVENTS) {
      await pauseAtLimit(audit, `Session paused at the ${MAX_EVENTS.toLocaleString('en-US')}-event limit. Export it if needed, then Clear to start a new one.`);
      return;
    }
    const currentAction = audit.actions.at(-1);
    const captured = decoded.map((event, index) => ({ ...event, id: `E${audit.events.length + index + 1}`, requestId: details.requestId, actionId: currentAction.id, action: currentAction.name, at: new Date(details.timeStamp).toISOString(), ...(fromWorker ? { viaServiceWorker: true } : {}) }));
    // Pause before accepting events that would not fit in storage, so the paused session
    // can always be written. A burst of large requests could otherwise overshoot the quota
    // between batched writes.
    const added = jsonBytes(captured);
    if (otherBytes(tabId) + projectedBytes(tabId) + added > STORAGE_BUDGET) {
      await pauseAtLimit(audit, STORAGE_NOTICE);
      return;
    }
    if (fromWorker) workerRequests.set(details.requestId, tabId);
    audit.events.push(...captured);
    pendingBytes.set(tabId, (pendingBytes.get(tabId) || 0) + added);
    await save(audit);
  });
}, filter, ['requestBody']);
function complete(details, failed = false) {
  // Paused sessions still record outcomes for requests captured before the pause.
  if (details.tabId >= 0 ? ready && !sessions.has(details.tabId) : ready && !workerRequests.has(details.requestId)) return;
  enqueue(async () => {
    await load();
    const tabId = details.tabId >= 0 ? details.tabId : workerRequests.get(details.requestId);
    workerRequests.delete(details.requestId);
    const audit = sessions.get(tabId);
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
    await save(audit);
  });
}
chrome.webRequest.onCompleted.addListener(details => complete(details), filter);
chrome.webRequest.onErrorOccurred.addListener(details => complete(details, true), filter);
chrome.tabs.onRemoved.addListener(tabId => enqueue(async () => {
  if (await read(tabId)) await remove(tabId);
}));
// Sessions exist only while a panel is open. Each panel holds a port to this worker; once the
// last one closes, every recording ends and its data is released from memory and storage.
const panels = new Set();
let resetTimer = null;
const RESET_GRACE_MS = 2000;
function scheduleReset() {
  clearTimeout(resetTimer);
  // A panel reload disconnects and reconnects within moments; only reset if none returns.
  resetTimer = setTimeout(() => enqueue(resetAll), RESET_GRACE_MS);
}
async function resetAll() {
  resetTimer = null;
  if (panels.size) return;
  await load();
  const tabIds = [...sessions.keys()];
  clearTimeout(flushTimer);
  flushTimer = null;
  for (const state of [sessions, storedBytes, pendingBytes, unsaved, workerRequests, pendingStarts]) state.clear();
  const stored = Object.keys(await chrome.storage.session.get(null)).filter(key => key.startsWith('audit:'));
  await chrome.storage.session.remove(stored);
  for (const tabId of tabIds) {
    await badge(tabId, null).catch(() => {});
    await chrome.tabs.sendMessage(tabId, { type: 'observe-stop' }).catch(() => {});
  }
}
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'panel' || port.sender?.id !== chrome.runtime.id) return;
  panels.add(port);
  clearTimeout(resetTimer);
  resetTimer = null;
  port.onDisconnect.addListener(() => {
    panels.delete(port);
    if (!panels.size) scheduleReset();
  });
});
// After a worker restart an open panel reconnects at once; sessions with no panel to return
// (the panel closed while this worker was stopped) are reset.
enqueue(load).then(() => { if (!panels.size && sessions.size) scheduleReset(); });
