# Pixel Inspector by PixelMonitor

A Chrome extension for marketers to see which advertising and analytics pixels fire, what data they send, and which visitor action preceded them. Requires Chrome 116 or later. No build step, account, server, or terminal is needed.

## Install locally

First [download or clone the repository](../README.md#install-from-source). You do not need Node.js or pnpm to load this extension.

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repository's `extension` folder.
4. Pin **Pixel Inspector by PixelMonitor** from Chrome's extensions menu.

## Inspect a journey

1. Open a website you manage or are authorized to inspect, then click the PixelMonitor toolbar icon.
2. Inspection starts automatically for the current website tab when the panel opens. Reload the page once if you want to include pixels that fired before the panel opened.
3. Browse normally. PixelMonitor records page views, clicked elements, and form submissions as one ordered visitor journey. Captured elements briefly flash blue.
4. Review each action alongside the marketing requests that appeared afterward.
5. Browse events by vendor and pixel ID. Open an event to inspect one payload field list. Badges distinguish vendor-required fields, website-specific custom fields, and other fields sent with the request.
6. Wait for delayed events, then click **Pause** when you want to stop capturing. Click **Resume** to continue the same session.

Each browser tab has its own session. A session follows its tab through reloads and navigation, including cross-domain navigation, and continues when you switch tabs. While the panel is open, switching to another website tab starts its inspection automatically. Clear deletes the captured results and immediately starts a fresh recording. Use Pause to stop capture. Closing a tab deletes its session. Closing and reopening the side panel does not stop inspection. Each tab stops at 1,000 events.

## What PixelMonitor recognizes

PixelMonitor recognizes browser requests from Meta, GA4, Google Ads, Google Floodlight, TikTok, Pinterest, LinkedIn, Snapchat, Microsoft Ads, Reddit Ads, X Ads, Adobe Analytics, Criteo, Taboola, and Outbrain. Script loads alone do not count as fired events.

It records request outcomes and payload fields as evidence without labeling the site healthy or broken. Repeated events remain visible without assuming they are erroneous duplicates. Existing cookies, consent choices, ad blockers, and browser settings can affect what appears.

Automatic capture records clicks, product URL patterns (`/product/`, `/products/`, `/p/`), product metadata, ordinary page navigation, and URL-changing single-page navigation. Forms are labeled as submitted without assuming a purchase or lead succeeded. Other languages and unusual controls appear as generic clicks; embedded frames may be missed.

## Vendor best-practice checks

The panel flags observed **Meta and GA4** payload issues and recommendations. Open a flagged event for the finding, suggested fix, vendor reference, and original payload. HTML, JSON, and plain-text exports include these checks; JSON stores them under `bestPractices`.

- **Meta:** pixel ID format, standard-event capitalization, missing Purchase value/currency, and numeric value/currency format.
- **GA4:** measurement ID format, event-name characters and length, ecommerce-event capitalization, purchase transaction ID, item presence and identity, currency when value is sent, purchase value, and value/currency format.

**Payload issue** means a recognized request failed a field or format check. **Recommendation** means it needs review in the context of your reporting goals or payload encoding. Checks run when a request is captured; HTTP 200 does not prove the payload is correct.

These are limited request-level checks, not a complete vendor audit. They do not establish action causation, catalog matching, account settings, consent compliance, server-side delivery, CAPI deduplication, or vendor receipt. Other vendors are still captured but are not covered by this feature. No findings does not mean the implementation is correct.

References: [Meta Pixel](https://developers.facebook.com/docs/meta-pixel/reference/), [GA4 events](https://developers.google.com/analytics/devguides/collection/ga4/reference/events), [GA4 event names](https://support.google.com/analytics/answer/13316687), and [GA4 collection limits](https://support.google.com/analytics/answer/9267744).

## Privacy and limits

- Session data stays in Chrome session storage until Chrome closes, the tab closes, or you clear it. PixelMonitor does not upload the captured data.
- PixelMonitor does not intentionally retain screenshots, cookies, URL fragments, browser headers, or values typed into forms on the inspected page.
- It stores the fields and values a site sends in recognized vendor requests. These payloads can include visitor identifiers, transaction IDs, customer data, page URLs, and consent values.
- URL origins and paths, event names, payload values, clicked-element roles, accessible names, and selector fallbacks may be retained. Review any downloaded file before sharing it.
- HTTP(S) host access is required to observe third-party pixel requests from the selected site. Only recognized events belonging to the inspected tab are saved.
- Browser requests do not prove platform receipt, attribution, or server-side tracking. A short session can also miss delayed events.

## Export a session

Click **Pause**, then choose **Pixel report** (HTML), **Session data** (JSON), or **Session summary** (plain text). Exports download to your computer; they do not send messages or upload data. Click **Resume** to continue recording.

## Update a source installation

For a cloned repository, run `git pull --ff-only` from its folder when your checkout has no local changes. For a ZIP download, download and extract the updated source. Reload the extension at `chrome://extensions`; if the folder changed, load the new `extension` folder. Refresh the website afterward. Reloading the extension clears captured sessions.

## Troubleshooting

- **No events appear:** open the panel before refreshing the website. Confirm recording is active, and check consent choices, ad blockers, and Chrome's site-access settings. Only supported request formats appear; script downloads alone do not count.
- **The panel does not inspect a page:** use an ordinary HTTP(S) website. Chrome restricts extensions on browser-internal pages and other protected pages.
- **Changes to the source do not appear:** reload the extension, then refresh the inspected tab.
- **Recording stops at 1,000 events:** export the paused session if needed, then use **Clear** to start a new one.

For bugs or feature requests, use [GitHub Issues](https://github.com/sharmamayur/pixelinspector/issues). Remove personal data from screenshots and reports before posting them. Send sensitive reports to [mayur@pixelmonitor.app](mailto:mayur@pixelmonitor.app).

For development and tests, see [CONTRIBUTING.md](../CONTRIBUTING.md). For packaging instructions, see the [project README](../README.md#package-from-source).
