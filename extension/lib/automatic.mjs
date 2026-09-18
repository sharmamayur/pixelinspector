export const actionLabels = { page: 'Page viewed', product: 'Product viewed', click: 'Element clicked', cart: 'Add to cart clicked', checkout: 'Checkout clicked', form: 'Form submitted' };
const expectedEvents = {
  page: { Meta: 'PageView', GA4: 'page_view', TikTok: 'PageView', Pinterest: 'pagevisit', Snapchat: 'PAGE_VIEW', 'Microsoft Ads': 'PageView', 'Reddit Ads': 'PageVisit' },
  product: { Meta: 'ViewContent', GA4: 'view_item', TikTok: 'ViewContent', Pinterest: 'pagevisit', Snapchat: 'VIEW_CONTENT', 'Reddit Ads': 'ViewContent' },
  cart: { Meta: 'AddToCart', GA4: 'add_to_cart', TikTok: 'AddToCart', Pinterest: 'addtocart', Snapchat: 'ADD_CART', 'Microsoft Ads': 'add_to_cart', 'Reddit Ads': 'AddToCart' },
  checkout: { Meta: 'InitiateCheckout', GA4: 'begin_checkout', TikTok: 'InitiateCheckout', Pinterest: 'initiatecheckout', Snapchat: 'START_CHECKOUT' },
};
// Allow asynchronous pixels to arrive after later actions; short captures are inconclusive.
export function automaticFindings(steps, events, endTime) {
  const findings = [];
  const platforms = new Set(events.filter(e => !e.failed && e.status >= 200 && e.status < 400).map(e => e.platform));
  for (const step of steps.filter(s => s.automatic && expectedEvents[s.action])) {
    const start = Date.parse(step.startedAt);
    if (!Number.isFinite(start) || endTime - start < 8000) continue;
    for (const [platform, expected] of Object.entries(expectedEvents[step.action])) {
      if (!platforms.has(platform)) continue;
      const observed = events.some(e => e.platform === platform && e.event === expected && Date.parse(e.at) >= start - 1000 && Date.parse(e.at) <= start + 8000);
      if (observed) continue;
      findings.push({ code: 'automatic.not_observed', severity: 'warning', platform, action: step.name, evidence: [], inferred: true,
        text: `${platform} ${expected} was not observed within 8 seconds of “${actionLabels[step.action]}”. This expectation was inferred from browsing, not confirmed site configuration.`,
        fix: 'Verify the action succeeded and check consent, custom events, and server-side tracking before treating this as a confirmed tracking problem.' });
    }
  }
  return findings;
}
