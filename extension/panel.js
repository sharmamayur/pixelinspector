import { bestPracticeVendors } from './lib/rule-config.mjs';
import { bestPracticeFindings, checkedVendors } from './lib/vendor-rules.mjs';
import { reportHtml, sessionSummary, failureLabel } from './lib/analyze.mjs';
import { prettyJson } from './lib/payload-fields.mjs';
const $ = id => document.getElementById(id);
let audit = null;
// The tab whose session the panel shows; only its storage key triggers a re-render.
let shownTabId = null;
let eventSession = null;
let vendorFilterSignature = null;
const openActions = new Set();
const openEvents = new Set();
const closedActionVendors = new Set();
const closedActionDestinations = new Set();
function syncVendorFilter(events) {
  const vendors = [...new Set(events.map(event => event.platform))].sort();
  const signature = vendors.join('\u0000');
  if (signature === vendorFilterSignature) return;
  vendorFilterSignature = signature;
  const selected = $('filter').value;
  const all = document.createElement('option'); all.value = ''; all.textContent = 'All vendors';
  const options = vendors.map(vendor => { const option = document.createElement('option'); option.value = vendor; option.textContent = vendor; return option; });
  $('filter').replaceChildren(all, ...options);
  $('filter').value = vendors.includes(selected) ? selected : '';
}
function detailRow(label, value, help) {
  const row = document.createElement('div');
  const term = document.createElement('dt'); term.textContent = label;
  const description = document.createElement('dd'); description.textContent = String(value);
  row.append(term, description);
  if (help) { const note = document.createElement('small'); note.textContent = help; description.append(note); }
  return row;
}
function normalizedFieldName(name) {
  const text = String(name || '').toLowerCase();
  const bracketed = text.match(/\[([^\]]+)\]$/)?.[1];
  return (bracketed || text.replace(/^(?:epn?|properties|event_metadata)\./, '')).replace(/[^a-z0-9]+/g, '');
}
function requiredFieldMatch(payload, required) {
  if (!required.present) return false;
  const payloadName = normalizedFieldName(payload.name);
  const requiredName = normalizedFieldName(required.name);
  if (payloadName === requiredName || payloadName.endsWith(requiredName)) return true;
  const requiredValue = String(required.value ?? '');
  return requiredValue && String(payload.value) === requiredValue;
}
function payloadRow(field, category, requirement, missing = false) {
  const row = detailRow(field.name, field.value, requirement);
  row.className = `payload-row field-${category}${missing ? ' field-missing' : ''}`;
  row.dataset.kind = missing ? 'missing' : category;
  const term = row.querySelector('dt');
  const label = term.textContent;
  const indicator = document.createElement('span'); indicator.className = 'field-indicator';
  const kind = missing ? 'Required field missing' : category === 'required' ? 'Required field' : category === 'standard' ? 'Standard field' : category === 'custom' ? 'Custom field' : 'Other field';
  indicator.title = kind; indicator.setAttribute('aria-label', kind);
  const name = document.createElement('span'); name.textContent = label;
  term.replaceChildren(indicator, name);
  return row;
}
function jsonFieldBlock(field) {
  const block = document.createElement('div'); block.className = 'json-field';
  const title = document.createElement('div'); title.className = 'json-field-name';
  const label = document.createElement('span'); label.textContent = field.label || field.name;
  const name = document.createElement('code'); name.textContent = field.name;
  const value = document.createElement('pre'); value.textContent = prettyJson(field.json);
  title.append(label, name); block.append(title, value);
  return block;
}
function unifiedPayloadSection(event) {
  const section = document.createElement('section'); section.className = 'payload-fields unified-payload';
  const heading = document.createElement('h4'); heading.textContent = 'Payload fields';
  const legend = document.createElement('div'); legend.className = 'payload-legend';
  for (const [kind, label] of [['required','Required'], ['standard','Standard'], ['custom','Custom'], ['other','Other']]) {
    const item = document.createElement('span');
    const dot = document.createElement('i'); dot.className = `field-indicator field-${kind}`;
    item.append(dot, label); legend.append(item);
  }
  const list = document.createElement('dl');
  const rows = { required: [], standard: [], custom: [], other: [] };
  const required = event.requiredFields || [];
  const standard = new Map((event.standardFields || []).map(field => [field.name, field]));
  const custom = new Map((event.customFields || []).map(field => [field.name, field]));
  const matchedRequired = new Set();
  const matchedStandard = new Set();
  const matchedCustom = new Set();
  for (const field of event.payloadFields || []) {
    const requiredIndex = required.findIndex((candidate, index) => !matchedRequired.has(index) && requiredFieldMatch(field, candidate));
    if (requiredIndex >= 0) {
      matchedRequired.add(requiredIndex);
      rows.required.push(payloadRow(field, 'required', required[requiredIndex].requirement));
    } else if (standard.has(field.name)) {
      matchedStandard.add(field.name);
      rows.standard.push(payloadRow(field, 'standard'));
    } else if (custom.has(field.name)) {
      matchedCustom.add(field.name);
      rows.custom.push(payloadRow(field, 'custom'));
    } else {
      rows.other.push(payloadRow(field, 'other'));
    }
  }
  required.forEach((field, index) => {
    if (matchedRequired.has(index)) return;
    rows.required.push(payloadRow({ name: field.name, value: field.present ? field.value : 'Missing' }, 'required', field.requirement, !field.present));
  });
  for (const field of standard.values()) {
    if (!matchedStandard.has(field.name)) rows.standard.push(payloadRow(field, 'standard'));
  }
  for (const field of custom.values()) {
    if (!matchedCustom.has(field.name)) rows.custom.push(payloadRow(field, 'custom'));
  }
  list.append(...rows.required, ...rows.standard, ...rows.custom, ...rows.other);
  section.append(heading, legend);
  if (list.children.length) section.append(list);
  for (const field of event.jsonFields || []) section.append(jsonFieldBlock(field));
  if (!list.children.length && !event.jsonFields?.length) { const empty = document.createElement('p'); empty.textContent = 'No payload fields were captured for this request.'; section.append(empty); }
  return section;
}
function actionContext(action) {
  const replay = action.replay;
  if (replay?.type === 'goto') {
    try {
      const url = new URL(replay.url);
      return { type: action.action === 'product' ? 'Product page' : 'Page navigation', detail: `${url.hostname}${url.pathname}` };
    } catch { return { type: 'Page navigation', detail: replay.url || 'Unknown page' }; }
  }
  if (replay?.type === 'click') {
    const element = replay.role || replay.tag || 'element';
    const target = replay.name || replay.selector || 'Unnamed element';
    return { type: `Clicked ${element}`, detail: target, selector: replay.selector };
  }
  if (replay?.type === 'manual') return { type: 'Form submission', detail: 'Field values were not recorded.' };
  return { type: 'Browser action', detail: action.action || 'Observed action' };
}
function journeyEventCard(event, expandMatch = false) {
  const card = document.createElement('article'); card.className = 'event'; card.dataset.eventId = event.id;
  const heading = document.createElement('div'); heading.className = 'event-heading';
  // The vendor is the heading of the group this card sits in.
  const title = document.createElement('strong'); title.textContent = event.event;
  heading.append(title);
  if (event.eventType) {
    const type = document.createElement('small'); type.className = `event-type event-type-${event.eventType}`;
    type.textContent = event.eventType === 'standard' ? 'Standard' : 'Custom';
    type.title = event.eventType === 'standard' ? 'Standard event defined by the vendor' : 'Custom event defined by the website';
    heading.append(type);
  }
  const findings = bestPracticeFindings([event]);
  if (findings.length) {
    const badge = document.createElement('span'); badge.className = 'check-badge';
    badge.textContent = `${findings.length} check${findings.length === 1 ? '' : 's'} flagged`;
    heading.append(badge);
  }
  // The pixel ID heads this card's group, and successful responses need no mention; a
  // status line appears only for failed, non-2xx, unconfirmed, or service worker requests.
  const time = document.createElement('small'); time.className = 'event-time';
  time.textContent = new Date(event.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  heading.append(time);
  const problem = event.failed ? failureLabel(event.failureReason) : !event.status ? 'Response unconfirmed' : event.status >= 300 ? `HTTP ${event.status}` : '';
  const notes = [problem, event.viaServiceWorker ? 'via service worker' : ''].filter(Boolean);
  const status = document.createElement('small'); status.className = `event-status${problem ? ' event-status-problem' : ''}`;
  status.textContent = notes.join(' · ');
  const details = readableEventDetails(event); details.open = expandMatch || openEvents.has(event.id);
  details.addEventListener('toggle', () => details.open ? openEvents.add(event.id) : openEvents.delete(event.id));
  card.append(heading, ...(notes.length ? [status] : []), details);
  return card;
}
function groupedActionEvents(actionId, events, expandMatches = false) {
  const container = document.createElement('div'); container.className = 'action-event-list';
  const vendors = new Map();
  for (const event of events) {
    if (!vendors.has(event.platform)) vendors.set(event.platform, new Map());
    const destination = event.pixelId || 'unknown';
    if (!vendors.get(event.platform).has(destination)) vendors.get(event.platform).set(destination, []);
    vendors.get(event.platform).get(destination).push(event);
  }
  for (const vendor of [...vendors.keys()].sort()) {
    const destinations = vendors.get(vendor);
    const vendorEvents = [...destinations.values()].flat();
    const vendorKey = `${actionId}\u0000${vendor}`;
    const vendorGroup = document.createElement('details'); vendorGroup.className = 'action-vendor-group'; vendorGroup.open = expandMatches || !closedActionVendors.has(vendorKey);
    vendorGroup.addEventListener('toggle', () => vendorGroup.open ? closedActionVendors.delete(vendorKey) : closedActionVendors.add(vendorKey));
    const vendorSummary = document.createElement('summary');
    vendorSummary.textContent = `${vendor} · ${destinations.size} pixel ID${destinations.size === 1 ? '' : 's'} · ${vendorEvents.length} event${vendorEvents.length === 1 ? '' : 's'}`;
    const vendorBody = document.createElement('div');
    for (const destination of [...destinations.keys()].sort()) {
      const destinationEvents = [...destinations.get(destination)].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
      const destinationKey = `${vendorKey}\u0000${destination}`;
      const destinationGroup = document.createElement('details'); destinationGroup.className = 'action-destination-group'; destinationGroup.open = expandMatches || !closedActionDestinations.has(destinationKey);
      destinationGroup.addEventListener('toggle', () => destinationGroup.open ? closedActionDestinations.delete(destinationKey) : closedActionDestinations.add(destinationKey));
      const destinationSummary = document.createElement('summary');
      destinationSummary.textContent = `${destination === 'unknown' ? 'Unidentified pixel ID' : `Pixel ID · ${destination}`} · ${destinationEvents.length} event${destinationEvents.length === 1 ? '' : 's'}`;
      const eventList = document.createElement('div'); eventList.className = 'destination-events';
      for (const event of destinationEvents) eventList.append(journeyEventCard(event, expandMatches));
      destinationGroup.append(destinationSummary, eventList); vendorBody.append(destinationGroup);
    }
    vendorGroup.append(vendorSummary, vendorBody); container.append(vendorGroup);
  }
  return container;
}
function journeyItem(action, index, events, filtersActive, expandMatches = false, actionMatched = false) {
  const actionId = action.id || String(index);
  const item = document.createElement('li'); item.dataset.actionId = actionId;
  const name = document.createElement('strong'); name.textContent = action.name;
  const context = actionContext(action);
  const description = document.createElement('p'); description.className = 'action-context';
  const kind = document.createElement('span'); kind.textContent = context.type;
  const detail = document.createElement('span'); detail.textContent = context.detail;
  description.append(kind, detail);
  if (context.selector && context.selector !== context.detail) {
    const selector = document.createElement('code'); selector.textContent = context.selector;
    description.append(selector);
  }
  const time = document.createElement('small'); time.className = 'action-time';
  time.textContent = new Date(action.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const tracking = document.createElement('details'); tracking.className = 'action-tracking'; tracking.open = expandMatches || openActions.has(actionId);
  tracking.addEventListener('toggle', () => tracking.open ? openActions.add(actionId) : openActions.delete(actionId));
  const summary = document.createElement('summary');
  summary.textContent = events.length ? `${events.length} tracking event${events.length === 1 ? '' : 's'} after this action` : filtersActive && !actionMatched ? 'No matching tracking events for this filter' : 'No recognized tracking events after this action';
  const flagged = bestPracticeFindings(events).length;
  if (flagged) summary.textContent += ` · ${flagged} checks flagged`;
  tracking.append(summary);
  if (events.length) tracking.append(groupedActionEvents(actionId, events, expandMatches));
  item.append(name, description, time, tracking);
  return item;
}
function eventChecks(event) {
  if (!bestPracticeVendors.includes(event.platform)) return document.createDocumentFragment();
  const section = document.createElement('section'); section.className = 'event-checks';
  const heading = document.createElement('h4'); heading.textContent = 'Vendor best-practice checks';
  section.append(heading);
  const findings = bestPracticeFindings([event]);
  if (!findings.length) {
    const note = document.createElement('p');
    note.textContent = 'No payload issues found.';
    section.append(note);
  }
  for (const finding of findings) {
    const item = document.createElement('div'); item.className = `check-finding ${finding.severity}`;
    const label = document.createElement('strong'); label.textContent = finding.category;
    const problem = document.createElement('p'); problem.textContent = finding.text;
    const fix = document.createElement('p'); fix.textContent = `Suggested fix: ${finding.fix}`;
    const link = document.createElement('a'); link.href = finding.source;
    link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = 'Vendor documentation';
    item.append(label, problem, fix, link); section.append(item);
  }
  return section;
}
function readableEventDetails(event, existing) {
  const wasOpen = Boolean(existing?.open);
  const details = existing || document.createElement('details');
  details.className = 'event-details';
  const summary = document.createElement('summary'); summary.textContent = `View payload · ${(event.payloadFields?.length || 0) + (event.jsonFields?.length || 0)} fields`;
  details.replaceChildren(summary, eventChecks(event), unifiedPayloadSection(event));
  details.open = wasOpen;
  return details;
}
function belongsToAction(event, action) {
  return action.id && event.actionId ? event.actionId === action.id : event.action === action.name;
}
function actionSearchText(action) {
  const context = actionContext(action);
  return [action.name, action.action, context.type, context.detail, context.selector, action.replay?.url]
    .filter(Boolean).join(' ').toLowerCase();
}
function eventSearchText(event) {
  return [
    event.platform, event.event, event.action, event.pixelId, event.endpoint,
    event.failed ? 'failed request' : event.status ? `HTTP ${event.status}` : 'response unconfirmed',
    ...bestPracticeFindings([event]).map(finding => `${finding.category} ${finding.text} ${finding.fix}`),
    JSON.stringify(event.requiredFields || []), JSON.stringify(event.customFields || []), JSON.stringify(event.payloadFields || []), JSON.stringify(event.jsonFields || []),
  ].filter(Boolean).join(' ').toLowerCase();
}
async function targetTabId(explicit) {
  if (Number.isInteger(explicit)) return explicit;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.startsWith(chrome.runtime.getURL('')) && audit?.tabId != null) return audit.tabId;
  if (tab?.url?.startsWith('http://') || tab?.url?.startsWith('https://')) return tab.id;
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs.filter(candidate => candidate.url?.startsWith('http://') || candidate.url?.startsWith('https://'))
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0]?.id;
}
async function command(type, data = {}) {
  $('error').textContent = '';
  try {
    const tabId = await targetTabId(data.tabId);
    if (!Number.isInteger(tabId)) throw new Error('Select a browser tab first.');
    const result = await chrome.runtime.sendMessage({ type, ...data, tabId });
    if (result.error) throw new Error(result.error);
    shownTabId = tabId;
    audit = result.audit;
    render();
  } catch (error) { $('error').textContent = error.message; }
}
function render() {
  $('clearSearch').hidden = !$('search').value;
  if (eventSession !== audit?.startedAt) {
    eventSession = audit?.startedAt;
    vendorFilterSignature = null;
    openActions.clear(); openEvents.clear(); closedActionVendors.clear(); closedActionDestinations.clear();
    $('journey').replaceChildren();
  }
  const state = audit?.recording ? 'recording' : audit ? 'stopped' : 'idle';
  $('status').dataset.state = state;
  $('status').textContent = audit?.recording ? 'Inspecting' : audit ? 'Paused' : 'Waiting';
  $('stop').hidden = !audit;
  $('stop').textContent = audit?.recording ? 'Pause' : 'Resume';
  $('clear').hidden = !audit;
  $('controls').hidden = !audit;
  $('results').hidden = !audit;
  $('captureTitle').textContent = audit?.recording ? 'Inspecting this journey' : audit ? 'Inspection paused' : 'Open a website to inspect';
  $('intro').hidden = false;
  $('site').textContent = audit ? new URL(audit.site).hostname : '';
  $('notice').textContent = audit?.notice || '';
  if (!audit) { syncVendorFilter([]); return; }
  syncVendorFilter(audit.events);
  const checks = bestPracticeFindings(audit.events);
  const issues = checks.filter(check => check.severity === 'error').length;
  const covered = audit.events.filter(event => bestPracticeVendors.includes(event.platform)).length;
  $('checkSummary').textContent = covered && !checks.length
    ? 'Congratulations! No issues found.'
    : `${issues} payload issues · ${checks.length - issues} recommendations across ${covered} checked requests`;
  $('checkCoverage').hidden = covered > 0 && !checks.length;
  $('checkCoverage').textContent = covered ? 'Open a flagged event for the issue, fix, and vendor reference.' : `Checks run automatically on ${checkedVendors} requests.`;
  const journeyActions = audit.actions.filter(action => action.replay);
  const vendors = new Set(audit.events.map(event => event.platform));
  const destinations = new Set(audit.events.map(event => `${event.platform}\u0000${event.pixelId || 'unknown'}`));
  $('actionMetric').textContent = journeyActions.length;
  $('vendorMetric').textContent = vendors.size;
  $('destinationMetric').textContent = destinations.size;
  $('eventMetric').textContent = audit.events.length;
  $('snapshotState').textContent = audit.recording ? 'Capturing as you browse' : 'Paused';
  const query = $('search').value.trim().toLowerCase();
  const vendor = $('filter').value;
  const filtersActive = Boolean(vendor || query);
  const vendorEvents = audit.events.filter(event => !vendor || event.platform === vendor);
  const visibleActions = journeyActions.map((action, index) => {
    const linkedEvents = vendorEvents.filter(event => belongsToAction(event, action));
    const actionMatched = Boolean(query && actionSearchText(action).includes(query));
    const events = query && !actionMatched ? linkedEvents.filter(event => eventSearchText(event).includes(query)) : linkedEvents;
    return { action, index, events, actionMatched };
  }).filter(result => !filtersActive || result.actionMatched || result.events.length);
  const visibleEventCount = visibleActions.reduce((total, result) => total + result.events.length, 0);
  $('actionCount').textContent = filtersActive ? `${visibleActions.length} of ${journeyActions.length} actions` : `${journeyActions.length} actions`;
  $('count').textContent = `${visibleEventCount} events`;
  $('journey').replaceChildren(...visibleActions.map(({ action, index, events, actionMatched }) => journeyItem(action, index, events, filtersActive, Boolean(query), actionMatched)));
  if (!visibleActions.length) {
    const item = document.createElement('li');
    item.textContent = filtersActive ? 'No journey activity matches your search.' : 'Your actions will appear here.';
    item.className = 'empty';
    $('journey').append(item);
  }
  for (const id of ['html','json','summary']) $(id).disabled = audit.recording;
}
$('stop').onclick = () => command(audit?.recording ? 'stop' : 'resume');
async function loadTab(explicitTabId) {
  const tabId = await targetTabId(explicitTabId);
  if (!Number.isInteger(tabId)) { audit = null; render(); return; }
  await command('get', { tabId });
  if (audit) return;
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url?.startsWith('http://') && !tab.url?.startsWith('https://')) return;
  await command('start', { tabId, url: tab.url });
}
$('clear').onclick = async () => {
  if (!confirm('Clear results and start a fresh recording?')) return;
  const tabId = audit?.tabId;
  await command('clear', { tabId });
  await loadTab(tabId);
};
$('filter').onchange = $('search').oninput = render;
$('clearSearch').onclick = () => {
  $('search').value = '';
  render();
  $('search').focus();
};
function setJourneyExpansion(open) {
  for (const details of $('journey').querySelectorAll('details')) details.open = open;
}
$('expandAll').onclick = () => setJourneyExpansion(true);
$('collapseAll').onclick = () => setJourneyExpansion(false);
function download(kind) {
  if (!audit || audit.recording) return;
  const evidence = { ...audit, bestPractices: bestPracticeFindings(audit.events) };
  const content = kind === 'html' ? reportHtml(evidence) : kind === 'json' ? JSON.stringify(evidence, null, 2) : sessionSummary(evidence);
  const blob = new Blob([content], { type: kind === 'html' ? 'text/html' : kind === 'json' ? 'application/json' : 'text/plain' });
  const suffix = kind === 'summary' ? 'summary.txt' : `report.${kind}`;
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `pixelmonitor-${new URL(audit.site).hostname}-${suffix}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
for (const id of ['html','json','summary']) $(id).onclick = () => download(id);
chrome.storage.onChanged.addListener((changes, area) => {
  const change = area === 'session' && shownTabId != null && changes[`audit:${shownTabId}`];
  if (!change) return;
  audit = change.newValue || null;
  render();
});
// Sent when the worker could not write a session to storage; fetch it from the worker instead.
chrome.runtime.onMessage.addListener(message => {
  if (message?.type === 'session-changed' && message.tabId === shownTabId) command('get', { tabId: shownTabId });
});
chrome.tabs.onActivated.addListener(({ tabId }) => loadTab(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.url || changeInfo.status === 'complete')) loadTab(tabId);
});
// Keep a port open to the worker: closing the last panel ends every recording and clears its
// data. The worker may stop and restart while the panel is open, so reconnect when it drops.
(function connectPanel() {
  chrome.runtime.connect({ name: 'panel' }).onDisconnect.addListener(() => setTimeout(connectPanel, 100));
})();
loadTab();
