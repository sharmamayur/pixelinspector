import { sources } from './sources.mjs';
import { present } from './helpers.mjs';

const metaStandard = ['PageView','ViewContent','Search','AddToCart','AddToWishlist','InitiateCheckout','AddPaymentInfo','Purchase','Lead','CompleteRegistration','Contact','CustomizeProduct','Donate','FindLocation','Schedule','StartTrial','SubmitApplication','Subscribe'];

export default [
  {
    id: 'meta.pixel_id',
    severity: 'error',
    source: sources.Meta,
    evaluate(event) {
      if (!/^\d+$/.test(event.pixelId || '')) return { text: 'Pixel ID is missing or is not numeric.', fix: 'Replace the placeholder with the Pixel ID from Events Manager.' };
      return null;
    },
  },
  {
    id: 'meta.event_case',
    severity: 'warning',
    source: sources.Meta,
    evaluate(event) {
      const standard = metaStandard.find(name => name.toLowerCase() === event.event.toLowerCase());
      if (standard && standard !== event.event) return { text: `Event name differs from the standard event ${standard}.`, fix: `If this is intended as a standard event, send ${standard} with this capitalization. Custom events may be intentional.` };
      return null;
    },
  },
  {
    id: 'meta.purchase_fields',
    severity: 'error',
    source: sources.Meta,
    evaluate(event) {
      if (event.event !== 'Purchase') return null;
      const missing = [];
      if (!present(event.value)) missing.push('value');
      if (!present(event.currency)) missing.push('currency');
      if (missing.length) return { text: `Purchase payload is missing ${missing.join(' and ')}.`, fix: 'Send the order value as a number and the three-letter currency on the Purchase event.' };
      return null;
    },
  },
];
