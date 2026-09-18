# Pixel Inspector by PixelMonitor

A Chrome extension for marketers to see which advertising and analytics pixels fire, what data they send, and which visitor action triggered them. Requires Chrome 116 or later. No build step, account, server, or terminal is needed.

## Install locally

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

## Privacy and limits

- Session data stays in Chrome session storage until Chrome closes, the tab closes, or you clear it. PixelMonitor does not upload the captured data.
- PixelMonitor does not intentionally retain screenshots, cookies, URL fragments, browser headers, or values typed into forms on the inspected page.
- It stores the fields and values a site sends in recognized vendor requests. These payloads can include visitor identifiers, transaction IDs, customer data, page URLs, and consent values.
- URL origins and paths, event names, payload values, clicked-element roles, accessible names, and selector fallbacks may be retained. Review any downloaded file before sharing it.
- HTTP(S) host access is required to observe third-party pixel requests from the selected site. Only recognized events belonging to the inspected tab are saved.
- Browser requests do not prove platform receipt, attribution, or server-side tracking. A short session can also miss delayed events.

The parser and report generator are shared with the repository's audit tools through `extension/lib/analyze.mjs`.

## Verification

Run `pnpm test` for the parser and analyzer tests. Run `pnpm test:browser` for the extension browser test using Playwright Chromium (`pnpm exec playwright install chromium`).

Chrome API references: [webRequest](https://developer.chrome.com/docs/extensions/reference/api/webRequest) and [sidePanel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel).

Feedback: [mayur@pixelmonitor.app](mailto:mayur@pixelmonitor.app?subject=Pixel%20Inspector%20feedback)

Store submission copy and dashboard disclosures are in [`store-listing.md`](store-listing.md). Store-ready graphic assets are in [`store-assets`](store-assets). Run `pnpm package:extension` from the repository root to create the upload ZIP.
