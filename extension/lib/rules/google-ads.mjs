import { sources } from './sources.mjs';
import { present } from './helpers.mjs';

export default [
  {
    id: 'ads.currency',
    severity: 'warning',
    source: sources['Google Ads'],
    evaluate(event) {
      if (event.event === 'conversion' && present(event.value) && !present(event.currency)) return { text: 'A conversion value is sent without an explicit currency.', fix: 'Verify the conversion action currency/defaults, or send currency explicitly.' };
      return null;
    },
  },
];
