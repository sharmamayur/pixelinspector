import { sources } from './sources.mjs';

export default [
  {
    id: 'microsoft.tag_id',
    severity: 'error',
    source: sources['Microsoft Ads'],
    evaluate(event) {
      if (event.pixelId === 'unknown') return { text: 'UET tag ID is missing from the recognized request.', fix: 'Send the Microsoft Advertising UET tag ID in the ti parameter.' };
      return null;
    },
  },
];
