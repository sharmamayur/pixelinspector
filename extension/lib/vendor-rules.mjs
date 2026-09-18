// Rules inspect browser payloads, never infer account configuration or server-side delivery.
export const sources = {
  Meta: 'https://developers.facebook.com/docs/meta-pixel/reference/',
  GA4: 'https://developers.google.com/analytics/devguides/collection/ga4/reference/events',
  gaNames: 'https://support.google.com/analytics/answer/13316687?hl=en',
  'Google Ads': 'https://support.google.com/google-ads/answer/6095947?hl=en',
  Pinterest: 'https://help.pinterest.com/en/business/article/add-event-codes',
  'Microsoft Ads': 'https://learn.microsoft.com/en-us/advertising/guides/universal-event-tracking?view=bingads-13',
};
const present = value => value !== null && value !== undefined;
const numeric = value => typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) && Number.isFinite(Number(value));
const ecommerce = new Set(['purchase','refund','add_to_cart','remove_from_cart','view_cart','begin_checkout','add_payment_info','add_shipping_info','view_item']);
const metaStandard = ['PageView','ViewContent','Search','AddToCart','AddToWishlist','InitiateCheckout','AddPaymentInfo','Purchase','Lead','CompleteRegistration','Contact','CustomizeProduct','Donate','FindLocation','Schedule','StartTrial','SubmitApplication','Subscribe'];
export function vendorFindings(event) {
  const result = [];
  // Unknown request formats are parser limitations, not evidence of a broken setup.
  // An unclassified Google request is a parser limitation, so do not validate its fields.
  if (event.platform === 'Google tag') return result;
  const add = (code, severity, text, fix, source = sources[event.platform]) => result.push({ code, severity, platform: event.platform, action: event.action || event.step, evidence: [event.id], text: `${event.platform} ${event.event}: ${text}`, fix, source });
  if (event.platform === 'Meta') {
    if (!/^\d+$/.test(event.pixelId || '')) add('meta.pixel_id', 'error', 'Pixel ID is missing or is not numeric.', 'Replace the placeholder with the Pixel ID from Events Manager.');
    const standard = metaStandard.find(name => name.toLowerCase() === event.event.toLowerCase());
    if (standard && standard !== event.event) add('meta.event_case', 'warning', `Event name differs from the standard event ${standard}.`, `If this is intended as a standard event, send ${standard} with this capitalization. Custom events may be intentional.`);
    if (event.event === 'Purchase') {
      const missing = [];
      if (!present(event.value)) missing.push('value');
      if (!present(event.currency)) missing.push('currency');
      if (missing.length) add('meta.purchase_fields', 'error', `Purchase payload is missing ${missing.join(' and ')}.`, 'Send the order value as a number and the three-letter currency on the Purchase event.');
    }
  }
  if (event.platform === 'GA4') {
    if (!/^G-[A-Z0-9]+$/.test(event.pixelId || '')) add('ga4.measurement_id', 'error', 'Missing or malformed web measurement ID.', 'Use the G- measurement ID from the intended GA4 web data stream.');
    if (!/^\p{L}[\p{L}\p{N}_]*$/u.test(event.event)) add('ga4.event_name', 'error', 'Event name contains invalid characters or does not start with a letter.', 'Start with a letter and use only letters, numbers, and underscores.', sources.gaNames);
    const lower = event.event.toLowerCase();
    if (ecommerce.has(lower) && event.event !== lower) add('ga4.event_case', 'warning', `This is a different event from the recommended ${lower} event.`, `Use ${lower} if this event is intended for standard ecommerce reporting.`, sources.gaNames);
    if (event.event === 'purchase' && event.hasTransactionId === false) add('ga4.transaction_id', 'error', 'Purchase has no nonempty transaction_id in the recognized payload.', 'Supply a unique transaction_id for the order so GA4 can deduplicate purchases.');
    if (ecommerce.has(event.event)) {
      if (event.itemCount === 0) add('ga4.items', 'warning', 'No items were found in the recognized ecommerce payload.', 'Verify that the event sends an items array. A custom encoding may require manual inspection.');
      if (event.itemsMissingIdentity > 0) add('ga4.item_identity', 'error', `${event.itemsMissingIdentity} item(s) lack both item_id and item_name.`, 'Supply at least one of item_id or item_name for every item.');
      if (present(event.value) && !present(event.currency)) add('ga4.currency_required', 'error', 'A value is sent without currency.', 'Send the three-letter currency alongside value.');
      if (event.event === 'purchase' && !present(event.value)) add('ga4.purchase_value', 'warning', 'Purchase value is absent; revenue reporting may be incomplete.', 'Send the sum of item price × quantity, excluding tax and shipping.');
    }
  }
  if (event.platform === 'Google Ads') {
    if (!/^\d+$/.test(event.pixelId || '')) return result;
    // Unlabelled hits may be remarketing. Account-level defaults can supply value/currency.
    if (event.event === 'conversion' && present(event.value) && !present(event.currency)) add('ads.currency', 'warning', 'A conversion value is sent without an explicit currency.', 'Verify the conversion action currency/defaults, or send currency explicitly.');
  }
  if (event.platform === 'Pinterest') {
    if (event.pixelId === 'unknown') add('pinterest.tag_id', 'error', 'Tag ID is missing from the recognized request.', 'Send the Pinterest tag ID in the tid parameter.');
    if (['checkout', 'addtocart'].includes(event.event) && event.value != null && !event.currency) add('pinterest.currency', 'error', 'A value is sent without currency.', 'Send currency with value for commerce events.');
    if (['checkout', 'addtocart', 'pagevisit'].includes(event.event) && event.hasProductId === false) add('pinterest.product_id', 'warning', 'No product ID was found in the recognized payload.', 'Verify product IDs if this tag supports catalog sales or dynamic retargeting.');
  }
  if (event.platform === 'Microsoft Ads' && event.pixelId === 'unknown') {
    add('microsoft.tag_id', 'error', 'UET tag ID is missing from the recognized request.', 'Send the Microsoft Advertising UET tag ID in the ti parameter.');
  }
  if (present(event.value) && !numeric(event.value)) add('payload.value', 'error', 'Value is not a finite numeric amount.', 'Send a number such as 49.95, without currency symbols, commas, or unresolved template variables.');
  if (present(event.currency) && !/^[A-Z]{3}$/.test(event.currency)) add('payload.currency', 'error', 'Currency is not in three-uppercase-letter format.', 'Send a three-letter ISO 4217 currency code, such as USD. This check validates format, not currency membership.');
  return result;
}
