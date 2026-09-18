# Website journey audits

Local tool for inspecting website journeys and recording advertising and analytics request evidence. Reports are saved locally. Supports recognized Meta browser events, GA4 collect requests (including form-encoded batches), and Google Ads conversion requests. Does not audit server-side tracking or every tracking vendor.

## Run

```sh
pnpm exec playwright install chromium
node scripts/audit/run.mjs https://example.com
```

Alternatively use your installed Chrome with `--channel chrome`.

A fresh browser opens. The initial page load is captured automatically. In the terminal, name each subsequent step **before** performing it in the browser, then press Enter after completing it. Examples: accept cookies, open product, add product to cart. Finish with `done` and record the consent choice and when you made it. Each step includes a three-second settling window. Events between named steps are not captured. Avoid making purchases or submitting real customer information while auditing.

Outputs in `audit-output/<host>-<timestamp>/`:

- `report.html`: local report with event evidence and screenshot links.
- `report.json`: machine-readable evidence and findings.
- `step-N.png`: viewport screenshots; review for private information before sharing.
- `summary.txt`: plain-text summary of the journey and observed events.

Raw request bodies, cookies, and full page URLs are not saved. Event names, pixel IDs, value/currency fields, and endpoint paths are retained; inspect artifacts before sharing. A request with an HTTP success does not establish receipt in the ad platform.

## Repeatable automatic journeys

```sh
node scripts/audit/run.mjs https://example.com --config scripts/audit/example.json --headless
```

Copy the example and customize it for each website. `goto` accepts `url` (relative or absolute, default: command-line URL). `click` accepts a Playwright `selector`. `wait` captures events without an action. Each step accepts `waitMs` (500–30000 ms, default 3000) and optional `expect` entries containing exact `platform` and `event` names. Step names must be unique. Set `consent` to describe the actual choice made by your configured steps. A failed step stops execution, marks the audit incomplete, and returns a nonzero exit code; earlier evidence is retained.

Example additional steps after the landing page:

```json
[
  { "name": "Accept cookies", "action": "click", "selector": "button:has-text('Accept all')" },
  { "name": "Product", "action": "goto", "url": "/products/example" },
  { "name": "Add to cart", "action": "click", "selector": "button:has-text('Add to cart')", "expect": [{ "platform": "Meta", "event": "AddToCart" }] }
]
```

Only add expectations you have reason to test. Missing browser events may be explained by consent, delayed delivery, unsupported formats, or server-side tracking. Manual mode lists observations and request/purchase-field issues but does not infer expected events from your step names. Repeat a suspected issue to confirm the observation. This version does not automatically discover journeys, verify CAPI, or declare a site healthy.

## Verification

`pnpm test` tests parsing, safe absence claims, payload checks, HTTP failures, and report escaping. Network capture uses Playwright's request/response events: https://playwright.dev/docs/network
