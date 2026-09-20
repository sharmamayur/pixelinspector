import { customFields, flattenFields, payloadFields, requiredField } from './payload-fields.mjs';

const clean = (value, fallback = 'unknown') => {
  const text = String(value ?? '').trim();
  return (text || fallback).slice(0, 120);
};

const jsonBody = body => {
  if (!body || !['{', '['].includes(body.trim()[0])) return null;
  try { return JSON.parse(body); } catch { return null; }
};

const formParams = (url, body) => {
  const params = new URLSearchParams(url.search);
  if (body && !body.trim().startsWith('{')) {
    for (const [key, value] of new URLSearchParams(body)) params.set(key, value);
  }
  return params;
};

const first = (...values) => values.find(value => value !== null && value !== undefined && String(value).trim() !== '');

const tikTokPayloads = json => {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== 'object') return [];
  for (const key of ['data', 'events', 'batch']) {
    if (Array.isArray(json[key])) return json[key];
    if (json[key] && typeof json[key] === 'object') return [json[key]];
  }
  return [json];
};

const tikTokEventName = (payload, activity) => {
  const configured = first(payload.event, payload.event_name, payload.eventName, payload.type);
  if (configured) return configured;
  const trigger = first(payload.auto_collected_properties?.page_trigger, payload.page_trigger);
  const action = first(trigger, payload.action);
  return action ? `${activity ? 'Auto ' : ''}${action}` : null;
};

const tikTokPixelId = (payload, params) => first(
  payload.pixel_code, payload.pixel_id, payload.pixelCode,
  payload.context?.pixel?.code, payload.context?.pixel?.pixel_code,
  payload.context?.pixel?.codes?.split('|')[0],
  payload.pixel?.code,
  params.get('pixel_code'), params.get('pixel_id'), params.get('pixelCode'),
  params.get('context.pixel.code'), params.get('context[pixel][code]'), params.get('sdkid'),
);

const event = (platform, name, pixelId, endpoint, extra = {}) => {
  const eventName = clean(name, 'Activity observed');
  const destination = clean(pixelId);
  const { requiredFields = [], customFields: additional = [], payloadEntries = [], ...metadata } = extra;
  return {
    platform,
    event: eventName,
    pixelId: destination,
    ...metadata,
    value: extra.value == null ? null : clean(extra.value, ''),
    currency: extra.currency == null ? null : clean(extra.currency, ''),
    requiredFields: [
      requiredField('Destination ID', pixelId, 'Identifies the vendor destination that should receive this event.'),
      requiredField('Event name', name, 'Identifies the behavior reported to the vendor.'),
      ...requiredFields,
    ],
    customFields: additional,
    payloadFields: payloadFields(payloadEntries),
    endpoint,
  };
};

// Retain interpreted metadata plus a field-by-field view of the request payload.
export function decodeMajorVendor(url, body = '') {
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  const params = formParams(url, body);
  const json = jsonBody(body);

  if (host === 'analytics.tiktok.com' && /^\/api\/v\d+\/pixel(?:\/act)?\/?$/.test(path)) {
    const activity = /\/act\/?$/.test(path);
    let parsed = json;
    if (!parsed) {
      for (const key of ['data', 'payload', 'events']) {
        const value = params.get(key);
        if (!value?.trim().startsWith('{') && !value?.trim().startsWith('[')) continue;
        try { parsed = JSON.parse(value); break; } catch {}
      }
    }
    const payloads = tikTokPayloads(parsed);
    if (payloads.length) return payloads.map(payload => {
      const properties = flattenFields(payload.properties || {});
      const name = tikTokEventName(payload, activity) || (activity ? 'Automatic activity' : null);
      const pixelId = tikTokPixelId(payload, params);
      return event('TikTok', name, pixelId, `${url.origin}/api/v2/pixel${activity ? '/act' : ''}`, {
          value: payload.properties?.value, currency: payload.properties?.currency,
          hasTransactionId: Boolean(payload.properties?.order_id || payload.event_id),
          customFields: customFields(properties),
          payloadEntries: [...params, ...flattenFields(payload)],
          ...(!payload.event && !payload.event_name && activity ? { classificationNote: 'TikTok automatic activity observed. The label comes from TikTok’s page trigger or activity action, not a configured event name.' } : {}),
        });
    });
    const name = first(params.get('event'), params.get('event_name'), params.get('eventName'), params.get('type'));
    const action = first(params.get('page_trigger'), params.get('action'));
    // A bodyless /pixel?sdkid= request loads pixel configuration; it is not a fired event.
    if (!name && !activity) return [];
    return [event('TikTok', name || (action ? `Auto ${action}` : 'Automatic activity'), tikTokPixelId({}, params), `${url.origin}/api/v2/pixel${activity ? '/act' : ''}`, {
      payloadEntries: [...params],
      ...(!name && activity ? { classificationNote: 'TikTok automatic activity observed. The label comes from TikTok’s page trigger or activity action, not a configured event name.' } : {}),
    })];
  }

  if (host === 'ct.pinterest.com' && /^\/v3\/?$/.test(path)) {
    const pinterestFields = [...params].filter(([key]) => /^ed\[.+\]$/.test(key));
    return [event('Pinterest', params.get('event') || 'PageVisit', params.get('tid'), `${url.origin}/v3/`, {
      value: params.get('ed[value]'), currency: params.get('ed[currency]'),
      hasTransactionId: Boolean(params.get('ed[order_id]') || params.get('ed[event_id]')),
      hasProductId: Boolean(params.get('ed[product_id]') || [...params.keys()].some(key => /line_items.*product_id/.test(key))),
      customFields: customFields(pinterestFields),
      payloadEntries: [...params],
    })];
  }

  if (host === 'px.ads.linkedin.com' && /^\/collect\/?$/.test(path)) {
    return [event('LinkedIn', params.get('conversionId') ? 'Conversion' : 'PageView', params.get('pid'), `${url.origin}/collect/`, {
      conversionId: params.get('conversionId') ? clean(params.get('conversionId')) : null,
      requiredFields: params.get('conversionId') ? [requiredField('Conversion ID', params.get('conversionId'), 'Identifies the LinkedIn conversion rule.')] : [],
      payloadEntries: [...params],
    })];
  }

  // Snap's SDK posts { ctx, req: [{ t: { pid, ev, ... }, ... }] } to /p.
  // req entries containing md, pc, or log are diagnostics, not pixel events.
  if (['tr.snapchat.com', 'tr6.snapchat.com'].includes(host) && /^\/p\/?$/.test(path)) {
    const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
    const commerceFields = ['price','value','currency','transaction_id','item_ids','item_category','description','number_items','payment_info_available','search_string','level','success','sign_up_method'];
    const makeEvent = (fields, entries) => {
      const name = first(fields.ev, fields.event);
      if (typeof name !== 'string') return [];
      return [event('Snapchat', name, fields.pid, `${url.origin}${path}`, {
        value: first(fields.price, fields.value), currency: fields.currency,
        hasTransactionId: Boolean(fields.transaction_id),
        customFields: customFields(flattenFields(fields).filter(([key]) => commerceFields.includes(key) || key.startsWith('item_ids['))),
        payloadEntries: entries,
      })];
    };
    if (isObject(json) && Array.isArray(json.req)) {
      const { req, ...context } = json;
      return req.flatMap((entry, index) => isObject(entry?.t)
        ? makeEvent(entry.t, [...params, ...flattenFields(context), ...flattenFields(entry, `req[${index}]`)])
        : []);
    }
    if (isObject(json)) return makeEvent(json, [...params, ...flattenFields(json)]);
    // Legacy query-string and form-encoded pixel requests.
    return makeEvent(Object.fromEntries(params), [...params]);
  }

  if (host === 'bat.bing.com' && /^\/action\/\d+\/?$/.test(path)) {
    const name = params.get('ea') || (params.get('evt') === 'pageLoad' ? 'PageView' : params.get('evt'));
    return [event('Microsoft Ads', name, params.get('ti'), `${url.origin}/action/`, {
      value: params.get('gv') || params.get('ev'), currency: params.get('gc'),
      customFields: customFields([...params].filter(([key]) => ['ec','ea','el','ev','gv','gc','cd'].includes(key))),
      payloadEntries: [...params],
    })];
  }

  if ((host === 'events.reddit.com' && /^\/v\d+\/?$/.test(path)) || (host === 'alb.reddit.com' && path === '/snoo.gif')) {
    return [event('Reddit Ads', json?.event_name || json?.event?.type || params.get('event') || params.get('event_name'),
      json?.pixel_id || params.get('id') || params.get('pixel_id'), `${url.origin}${host === 'alb.reddit.com' ? '/snoo.gif' : '/v2/'}`, {
        value: json?.event_metadata?.value || params.get('value'), currency: json?.event_metadata?.currency || params.get('currency'),
        customFields: customFields(json?.event_metadata ? flattenFields(json.event_metadata) : [...params].filter(([key]) => ['value','currency','item_count','products','conversion_id'].includes(key))),
        payloadEntries: json ? flattenFields(json) : [...params],
      })];
  }

  if ((host === 'analytics.twitter.com' || host === 't.co') && /^\/i\/adsct\/?$/.test(path)) {
    const transaction = params.get('txn_id');
    const parts = transaction?.match(/^([^-]+)-([^-]+)-(.+)$/);
    return [event('X Ads', parts ? `Event ${parts[3]}` : 'PageView', parts?.[2] || params.get('pixel_id'), `${url.origin}/i/adsct`, {
      value: params.get('value'), currency: params.get('currency'),
      customFields: customFields([...params].filter(([key]) => ['value','currency','tw_sale_amount','tw_order_quantity'].includes(key))),
      payloadEntries: [...params],
    })];
  }

  if (/\/b\/ss\//.test(path) && (/\.sc\.omtrdc\.net$/.test(host) || /\.data\.adobedc\.net$/.test(host))) {
    const suite = path.match(/\/b\/ss\/([^/]+)/)?.[1];
    return [event('Adobe Analytics', params.get('pe') || (params.get('events') ? 'Tracked event' : 'PageView'), suite, `${url.origin}/b/ss/`, {
      classificationNote: 'Adobe Analytics beacon observed. Report-suite event mappings require the advertiser configuration.',
      customFields: customFields([...params].filter(([key]) => /^(?:evar|prop|list)\d+$|^contextdata\.|^(?:events|products)$/i.test(key))),
      payloadEntries: [...params],
    })];
  }

  if (['widget.eu.criteo.com', 'widget.us.criteo.com', 'sslwidget.criteo.com'].includes(host) && /\/event\/?$/.test(path)) {
    return [event('Criteo', params.get('event') || params.get('e'), params.get('account') || params.get('a'), `${url.origin}/event`, {
      value: params.get('amount'), currency: params.get('currency'),
      customFields: customFields([...params].filter(([key]) => !['account','a','event','e'].includes(key))),
      payloadEntries: [...params],
    })];
  }

  if (host === 'trc.taboola.com' && /\/log\/3\/unip\/?$/.test(path)) {
    const pathAccount = path.match(/^\/([^/]+)\/log\/3\/unip\/?$/)?.[1];
    return [event('Taboola', params.get('en') || params.get('event') || params.get('name'), params.get('account') || params.get('pixel_id') || pathAccount, `${url.origin}/log/3/unip`, {
      value: params.get('revenue'), currency: params.get('currency'),
      customFields: customFields([...params].filter(([key]) => !['account','pixel_id','en','event','name'].includes(key))),
      payloadEntries: [...params],
      classificationNote: 'Taboola activity observed. Event semantics may depend on the advertiser configuration.',
    })];
  }

  if (/\.outbrain\.com$/.test(host) && /\/obtpixel\.gif$/.test(path)) {
    return [event('Outbrain', params.get('name') || params.get('event'), params.get('obtp') || params.get('pixel_id'), `${url.origin}/obtpixel.gif`, {
      value: params.get('orderValue') || params.get('value'), currency: params.get('currency'),
      customFields: customFields([...params].filter(([key]) => !['obtp','pixel_id','name','event'].includes(key))),
      payloadEntries: [...params],
      classificationNote: 'Outbrain activity observed. Event semantics may depend on the advertiser configuration.',
    })];
  }

  return [];
}
