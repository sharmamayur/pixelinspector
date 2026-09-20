import { present, numeric } from './helpers.mjs';

export default [
  {
    id: 'payload.value',
    severity: 'error',
    evaluate(event) {
      if (present(event.value) && !numeric(event.value)) return { text: 'Value is not a finite numeric amount.', fix: 'Send a number such as 49.95, without currency symbols, commas, or unresolved template variables.' };
      return null;
    },
  },
  {
    id: 'payload.currency',
    severity: 'error',
    evaluate(event) {
      if (present(event.currency) && !/^[A-Z]{3}$/.test(event.currency)) return { text: 'Currency is not in three-uppercase-letter format.', fix: 'Send a three-letter ISO 4217 currency code, such as USD. This check validates format, not currency membership.' };
      return null;
    },
  },
];
