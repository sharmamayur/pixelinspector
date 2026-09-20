import { sources } from './sources.mjs';
import { present } from './helpers.mjs';

const ecommerce = new Set(['purchase','refund','add_to_cart','remove_from_cart','view_cart','begin_checkout','add_payment_info','add_shipping_info','view_item']);

export default [
  {
    id: 'ga4.measurement_id',
    severity: 'error',
    source: sources.GA4,
    evaluate(event) {
      if (!/^G-[A-Z0-9]+$/.test(event.pixelId || '')) return { text: 'Missing or malformed web measurement ID.', fix: 'Use the G- measurement ID from the intended GA4 web data stream.' };
      return null;
    },
  },
  {
    id: 'ga4.event_name',
    severity: 'error',
    source: sources.gaNames,
    evaluate(event) {
      if (!/^\p{L}[\p{L}\p{N}_]*$/u.test(event.event)) return { text: 'Event name contains invalid characters or does not start with a letter.', fix: 'Start with a letter and use only letters, numbers, and underscores.' };
      return null;
    },
  },
  {
    id: 'ga4.event_length',
    severity: 'error',
    source: sources.gaLimits,
    evaluate(event) {
      if ([...event.event].length > 40) return { text: 'Event name exceeds 40 characters.', fix: 'Use an event name with at most 40 characters.' };
      return null;
    },
  },
  {
    id: 'ga4.event_case',
    severity: 'warning',
    source: sources.gaNames,
    evaluate(event) {
      const lower = event.event.toLowerCase();
      if (ecommerce.has(lower) && event.event !== lower) return { text: `This is a different event from the recommended ${lower} event.`, fix: `Use ${lower} if this event is intended for standard ecommerce reporting.` };
      return null;
    },
  },
  {
    id: 'ga4.transaction_id',
    severity: 'error',
    source: sources.GA4,
    evaluate(event) {
      if (event.event === 'purchase' && event.hasTransactionId === false) return { text: 'Purchase has no nonempty transaction_id in the recognized payload.', fix: 'Supply a unique transaction_id for the order so GA4 can deduplicate purchases.' };
      return null;
    },
  },
  {
    id: 'ga4.items',
    severity: 'warning',
    source: sources.GA4,
    evaluate(event) {
      if (ecommerce.has(event.event) && (event.itemCount === 0)) return { text: 'No items were found in the recognized ecommerce payload.', fix: 'Verify that the event sends an items array. A custom encoding may require manual inspection.' };
      return null;
    },
  },
  {
    id: 'ga4.item_identity',
    severity: 'error',
    source: sources.GA4,
    evaluate(event) {
      if (ecommerce.has(event.event) && (event.itemsMissingIdentity > 0)) return { text: `${event.itemsMissingIdentity} item(s) lack both item_id and item_name.`, fix: 'Supply at least one of item_id or item_name for every item.' };
      return null;
    },
  },
  {
    id: 'ga4.currency_required',
    severity: 'error',
    source: sources.GA4,
    evaluate(event) {
      if (ecommerce.has(event.event) && (present(event.value) && !present(event.currency))) return { text: 'A value is sent without currency.', fix: 'Send the three-letter currency alongside value.' };
      return null;
    },
  },
  {
    id: 'ga4.purchase_value',
    severity: 'warning',
    source: sources.GA4,
    evaluate(event) {
      if (ecommerce.has(event.event) && (event.event === 'purchase' && !present(event.value))) return { text: 'Purchase value is absent; revenue reporting may be incomplete.', fix: 'Send the sum of item price × quantity, excluding tax and shipping.' };
      return null;
    },
  },
];
