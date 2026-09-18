import { automaticFindings } from './automatic.mjs';
import { decodeMajorVendor } from './major-vendors.mjs';
import { vendorFindings } from './vendor-rules.mjs';
import { customFields, payloadFields, requiredField } from './payload-fields.mjs';

// Persist interpreted event metadata and the request payload fields observed by the browser.
export function decodeEvents(rawUrl, body = '') {
  const url = new URL(rawUrl);
  const majorVendorEvents = decodeMajorVendor(url, body);
  if (majorVendorEvents.length) return majorVendorEvents;
  const floodlightPath = url.pathname.match(/^\/(gmp\/conversion\/|ddm\/activity\/|activityi?;)(.*)$/);
  const floodlightHost = /(^|\.)(google\.com|doubleclick\.net)$/.test(url.hostname);
  if (floodlightHost && floodlightPath) {
    const fields = new URLSearchParams(floodlightPath[2].replace(/;/g, '&'));
    // Retain configuration metadata only; omit user IDs, referrers, consent strings and ord.
    const src = fields.get('src');
    const group = fields.get('type');
    const activity = fields.get('cat');
    return [{
      platform: 'Google Floodlight', event: activity ? `Activity ${activity.slice(0, 100)}` : 'Activity (unidentified)',
      pixelId: /^\d+$/.test(src || '') ? src : 'unknown',
      activityGroup: group?.slice(0, 100) || null, activityId: activity?.slice(0, 100) || null,
      requiredFields: [
        requiredField('Floodlight source (src)', src, 'Identifies the advertiser configuration.'),
        requiredField('Activity group (type)', group, 'Identifies the Floodlight activity group.'),
        requiredField('Activity ID (cat)', activity, 'Identifies the Floodlight activity.'),
      ],
      customFields: customFields([...fields].filter(([key]) => /^u\d+$/i.test(key))),
      payloadFields: payloadFields([...fields]),
      value: null, currency: null,
      classificationNote: 'Floodlight activity observed. Its business meaning and configuration are not verified.',
      endpoint: `${url.origin}/${floodlightPath[1].replace(/;$/, '')}`,
    }];
  }
  const initialParams = new URLSearchParams(url.search);
  if (body && !body.trim().startsWith('{')) {
    for (const [key, value] of new URLSearchParams(body.split('\n')[0])) initialParams.set(key, value);
  }
  const meta = url.hostname === 'www.facebook.com' && /^\/tr\/?$/.test(url.pathname);
  const officialGaHost = /(^|\.)(google-analytics\.com|analytics\.google\.com)$/.test(url.hostname);
  const ga = /\/g\/collect\/?$/.test(url.pathname) && (officialGaHost || /^G-[A-Z0-9]+$/i.test(initialParams.get('tid') || ''));
  const googleHost = /(^|\.)(googleadservices\.com|google\.com|doubleclick\.net)$/.test(url.hostname);
  const adsCollect = googleHost && /\/ccm\/collect\/?$/.test(url.pathname) && /^AW-\d+$/i.test(initialParams.get('tid') || '');
  if (adsCollect) {
    const eventName = initialParams.get('en') || initialParams.get('label') || 'conversion';
    return [{
      platform: 'Google Ads', event: eventName.slice(0, 120),
      pixelId: initialParams.get('tid').slice(0, 100),
      value: initialParams.get('value'), currency: initialParams.get('currency') || initialParams.get('currency_code'),
      hasTransactionId: Boolean(initialParams.get('oid') || initialParams.get('transaction_id')),
      requiredFields: [
        requiredField('Conversion ID', initialParams.get('tid'), 'Identifies the Google Ads destination.'),
        requiredField('Event name', eventName, 'Identifies the conversion or remarketing activity.'),
      ],
      customFields: customFields([...initialParams].filter(([key]) => /^(?:ep|epn)\.|^u\d+$|^(?:value|currency|currency_code|oid|transaction_id)$/i.test(key))),
      payloadFields: payloadFields([...initialParams]),
      endpoint: `${url.origin}/ccm/collect`,
    }];
  }
  const ads = googleHost && /\/(?:pagead\/)?(?:1p-)?(?:viewthroughconversion|conversion|user-list)\//.test(url.pathname);
  if (!meta && !ga && !ads) return [];
  return (body ? body.split('\n') : ['']).map(line => {
    const params = new URLSearchParams(url.search);
    for (const [key, value] of new URLSearchParams(line)) params.set(key, value);
    // Google destination IDs belong to the endpoint path; tid can describe a different tag.
    const adsId = ads ? url.pathname.match(/(?:viewthroughconversion|conversion|user-list)\/([^/]+)/)?.[1] : null;
    const adsRecognized = ads && /^\d+$/.test(adsId || '');
    const event = meta ? params.get('ev') : ga ? params.get('en') : !adsRecognized ? 'unclassified request' : params.get('label') ? 'conversion' : 'remarketing';
    const items = ga ? [...params].filter(([key]) => /^pr\d+$/.test(key)).map(([, value]) => value) : [];
    const transactionId = params.get(meta ? 'cd[order_id]' : ga ? 'ep.transaction_id' : 'oid') ?? (ga ? params.get('epn.transaction_id') : null);
    const gaItemEvents = new Set(['purchase','refund','add_to_cart','remove_from_cart','view_cart','begin_checkout','add_payment_info','add_shipping_info','view_item']);
    const gaValue = params.get('epn.value') ?? params.get('ep.value');
    const requiredFields = meta ? [
      requiredField('Pixel ID', params.get('id'), 'Identifies the Meta Pixel.'),
      requiredField('Event name', params.get('ev'), 'Identifies the behavior reported to Meta.'),
      ...(event === 'Purchase' ? [
        requiredField('value', params.get('cd[value]'), 'Required for the Meta Purchase event.'),
        requiredField('currency', params.get('cd[currency]'), 'Required for the Meta Purchase event.'),
      ] : []),
    ] : ga ? [
      requiredField('Measurement ID', params.get('tid'), 'Identifies the GA4 web data stream.'),
      requiredField('Event name', params.get('en'), 'Identifies the event sent to GA4.'),
      ...(event === 'purchase' ? [requiredField('transaction_id', transactionId, 'Required for GA4 purchase deduplication.', { hide: true })] : []),
      ...(gaItemEvents.has(event) ? [requiredField('items', items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : null, `Required for the recommended GA4 ${event} event.`)] : []),
      ...(gaValue != null ? [requiredField('currency', params.get('cu') ?? params.get('ep.currency'), 'Required when a GA4 event includes value.')] : []),
    ] : adsRecognized ? [
      requiredField('Conversion ID', adsId, 'Identifies the Google Ads destination.'),
      requiredField('Event type', event, 'Identifies this request as conversion or remarketing activity.'),
      ...(event === 'conversion' ? [requiredField('Conversion label', params.get('label'), 'Identifies the Google Ads conversion action.')] : []),
    ] : [];
    const additional = meta
      ? customFields([...params].filter(([key]) => /^cd\[.+\]$/.test(key)), event === 'Purchase' ? ['cd[value]','cd[currency]'] : [])
      : ga
        ? customFields([...params].filter(([key]) => /^(?:ep|epn)\.|^pr\d+$/.test(key)), ['ep.transaction_id','epn.transaction_id'])
        : adsRecognized
          ? customFields([...params].filter(([key]) => /^(?:ep|epn)\.|^u\d+$|^(?:value|currency|currency_code|oid|transaction_id)$/i.test(key)))
          : [];
    if (!event) return null;
    return {
      platform: meta ? 'Meta' : ga ? 'GA4' : adsRecognized ? 'Google Ads' : 'Google tag',
      ...(ads && !adsRecognized ? { classificationNote: 'Google request format not recognized. No vendor setup checks applied.' } : {}),
      event: event.slice(0, 120),
      pixelId: ((meta ? params.get('id') : ga ? params.get('tid') : adsRecognized ? adsId : null) || 'unknown').slice(0, 100),
      value: params.get(meta ? 'cd[value]' : ga ? 'epn.value' : 'value') ?? params.get('ep.value'),
      currency: params.get(meta ? 'cd[currency]' : ga ? 'cu' : 'currency_code') ?? params.get('ep.currency'),
      hasTransactionId: Boolean(transactionId?.trim()),
      requiredFields,
      customFields: additional,
      payloadFields: payloadFields([...params]),
      ...(ga ? { itemCount: items.length, itemsMissingIdentity: items.filter(item => !/(?:^|~)(?:id|nm)[^~]+/.test(item)).length } : {}),
      endpoint: ads && !adsRecognized ? `${url.origin}${url.pathname.split('/conversion/')[0]}/conversion/` : `${url.origin}${url.pathname}`,
    };
  }).filter(Boolean);
}

export function failureDetails(reason) {
  const code = String(reason || 'Unknown browser network error');
  if (code.includes('ERR_BLOCKED_BY_CLIENT')) return {
    label: 'Blocked by the browser or an extension',
    text: 'was blocked on this device before it reached the vendor',
    fix: 'Repeat without an ad blocker or privacy extension, and compare the result before treating this as a site issue.',
  };
  if (code.includes('ERR_ABORTED')) return {
    label: 'Canceled by the browser',
    text: 'was canceled by the browser, often because the page navigated or unloaded',
    fix: 'Repeat the click and wait before navigating. If it succeeds, the cancellation was timing-related.',
  };
  if (code.includes('ERR_NAME_NOT_RESOLVED') || code.includes('ERR_INTERNET_DISCONNECTED') || code.includes('ERR_NETWORK_CHANGED')) return {
    label: 'Network unavailable',
    text: 'failed because the vendor host could not be reached from this device',
    fix: 'Verify the network connection and repeat before assessing the site’s implementation.',
  };
  return {
    label: `Browser network failure (${code})`,
    text: `ended with ${code} before an HTTP response was received`,
    fix: 'Repeat the action and compare with DevTools or the vendor diagnostics. One browser failure does not establish a setup defect.',
  };
}

export function analyze(steps, events, { live = false, endTime = Date.now() } = {}) {
  const findings = [];
  for (const step of steps) {
    if (step.error) {
      findings.push({ severity: 'warning', code: 'action.incomplete', action: step.name, evidence: [], text: `Action could not be completed: ${step.error}. No absence claims made for this action.`, fix: 'Repeat this action before drawing conclusions.' });
      continue;
    }
    const captured = events.filter(e => step.id && e.actionId ? e.actionId === step.id : (e.action || e.step) === step.name);
    for (const expected of (!live || step.endedAt ? step.expect || [] : [])) {
      if (!captured.some(e => e.platform === expected.platform && e.event === expected.event)) {
        findings.push({ severity: 'warning', code: 'event.not_observed', platform: expected.platform, action: step.name, evidence: [], text: `${expected.platform} ${expected.event} was not observed after this action. It may be consent-dependent, delayed, or sent server-side.`, fix: 'Repeat the journey with the intended consent choice and verify server-side tracking.' });
      }
    }
    for (const event of captured) {
      if (event.failed) {
        const failure = failureDetails(event.failureReason);
        findings.push({ severity: 'warning', code: 'request.delivery', platform: event.platform, action: step.name, evidence: [event.id], text: `${event.platform} ${event.event} request to destination ${event.pixelId} ${failure.text}. Delivery is unverified.`, fix: failure.fix });
      } else if (event.status >= 400) {
        findings.push({ severity: 'warning', code: 'request.delivery', platform: event.platform, action: step.name, evidence: [event.id], text: `${event.platform} ${event.event} request to destination ${event.pixelId} returned HTTP ${event.status}. Delivery needs verification.`, fix: 'Check consent, network availability, and vendor diagnostics. One HTTP error does not establish a setup defect.' });
      }
      findings.push(...vendorFindings(event));
    }
  }
  findings.push(...automaticFindings(steps, events, steps.at(-1)?.endedAt ? Math.min(endTime, Date.parse(steps.at(-1).endedAt)) : endTime));
  return findings.sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1));
}

export const limitations = 'Single browser observation, not proof of broken tracking or lost revenue. Server-side events, platform receipt, attribution, custom endpoints, and unrecognized payload formats are not verified. Missing events are checked against explicit expectations or clearly labeled browsing-based inferences. Inferred actions may not have succeeded. Repeated events are listed without assuming duplication is a defect.';
export function reportHtml(report) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const payloadHtml = event => {
    const required = (event.requiredFields || []).map(field => `${esc(field.name)}: ${esc(field.present ? field.value : 'Missing')}`).join('<br>') || 'Schema unavailable';
    const custom = (event.customFields || []).map(field => `${esc(field.name)}: ${esc(field.value)}`).join('<br>') || 'None observed';
    const full = (event.payloadFields || []).map(field => `${esc(field.name)}: ${esc(field.value)}`).join('<br>') || 'None retained';
    return `<b>Required</b><br>${required}<br><br><b>Custom</b><br>${custom}<br><br><b>Full payload</b><br>${full}`;
  };
  const recorded = report.actions || report.steps || [];
  const actions = recorded.filter(action => action.replay);
  const timeline = actions.length ? actions : recorded;
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>PixelMonitor pixel inspection</title><style>body{font:16px/1.6 system-ui;max-width:1200px;margin:48px auto;padding:0 24px;color:#172033}h1,h2{line-height:1.2}table{border-collapse:collapse;width:100%;font-size:14px}td,th{text-align:left;vertical-align:top;border-bottom:1px solid #ddd;padding:10px}aside{background:#eff6ff;padding:16px}img{max-width:100%;border:1px solid #ddd}small{color:#526078}</style><h1>PixelMonitor pixel inspection</h1><p>${esc(report.site)} · ${esc(report.startedAt)}</p><p>Browser: ${esc(report.browser)} · Consent: ${esc(report.consent)}</p><aside>${esc(limitations)}</aside><h2>Visitor journey</h2><ol>${timeline.map(action => `<li><b>${esc(action.name.replace(/^\d+\.\s*/, ''))}</b> — ${esc(action.error || 'Completed')}<br><small>${esc(action.startedAt)} to ${esc(action.endedAt)}</small>${action.screenshot ? `<br><a href="${esc(action.screenshot)}">View action screenshot</a>` : ''}</li>`).join('')}</ol><h2>Observed browser requests</h2><table><tr><th>Evidence</th><th>After action / time</th><th>Platform / event</th><th>Pixel ID</th><th>Payload fields</th><th>HTTP</th></tr>${report.events.map(e => `<tr><td>${esc(e.id)}</td><td>${esc(e.action || e.step)}<br>${esc(e.at)}</td><td>${esc(e.platform)} / ${esc(e.event)}</td><td>${esc(e.pixelId)}</td><td>${payloadHtml(e)}</td><td>${esc(e.failed ? 'Failed' : e.status || 'Unconfirmed')}</td></tr>`).join('')}</table>`;
}
export function sessionSummary(report) {
  const observed = [...new Set(report.events.map(e => `${e.platform} ${e.event}`))].join(', ');
  const recorded = report.actions || report.steps || [];
  const actions = recorded.filter(action => action.replay && !action.error);
  const timeline = (actions.length ? actions : recorded.filter(action => !action.error)).map(action => action.name.replace(/^\d+\.\s*/, '')).join(' → ');
  return `Pixel tracking summary: ${report.site}\n\nCaptured: ${report.startedAt}\nConsent setting: ${report.consent}\n\nVisitor journey: ${timeline || 'No actions recorded'}.\n${observed ? `Observed browser events: ${observed}.` : 'No events recognized by PixelMonitor were observed during this session.'}\n\nThis capture shows browser requests only; server-side tracking and vendor processing are not visible here.\n`;
}
