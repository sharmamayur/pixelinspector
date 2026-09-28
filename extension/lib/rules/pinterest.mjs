import { sources } from './sources.mjs';

export default [
  {
    id: 'pinterest.currency',
    severity: 'error',
    source: sources.Pinterest,
    evaluate(event) {
      if (['checkout', 'addtocart'].includes(event.event.toLowerCase()) && event.value != null && !event.currency) return { text: 'A value is sent without currency.', fix: 'Send currency with value for commerce events.' };
      return null;
    },
  },
  {
    id: 'pinterest.product_id',
    severity: 'warning',
    source: sources.Pinterest,
    evaluate(event) {
      if (['checkout', 'addtocart'].includes(event.event.toLowerCase()) && event.hasProductId === false) return { text: 'No product ID was found in the recognized payload.', fix: 'Verify product IDs if this tag supports catalog sales or dynamic retargeting.' };
      return null;
    },
  },
];
