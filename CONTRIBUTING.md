# Contributing to Pixel Inspector

Bug fixes, documentation improvements, tests, and support for additional advertising and analytics request formats are welcome.

## Report an issue

Search existing [issues](https://github.com/sharmamayur/pixelinspector/issues) before opening a new one. Include:

- Chrome version and Pixel Inspector version from `chrome://extensions`.
- Steps to reproduce, expected behavior, and observed behavior.
- The affected vendor and event, with a minimal sanitized URL or payload if relevant.
- Whether consent settings or an ad blocker affect the result.

Do not post customer information, cookies, access tokens, or unredacted reports. Send sensitive security reports to [mayur@pixelmonitor.app](mailto:mayur@pixelmonitor.app).

## Set up a contribution

Fork the repository on GitHub, clone your fork, and create a branch for your change. Use Node.js 20 or later and pnpm, then run these commands from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test
pnpm test:browser
```

Load the `extension` directory as an unpacked extension in Chrome. There is no compilation step. Reload the extension in `chrome://extensions` and refresh your test website after changing its source.

## Project layout

- `extension/background.js`: request capture and per-tab sessions.
- `extension/observer.js`: page navigation and interaction capture.
- `extension/panel.*`: side-panel interface and exports.
- `extension/lib/`: shared request parsers and report generation.
- `scripts/audit/`: command-line audit tools and tests; `analyze.mjs` re-exports the extension's shared implementation.

## Submit a pull request

Keep each pull request focused on one change. Explain the problem, resulting behavior, and verification performed. Update the relevant documentation when behavior changes.

For vendor checks, cite the official documentation, distinguish required fields from conditional recommendations, and include examples that must not be flagged. Do not infer account configuration or server-side behavior from missing browser fields.

For parser changes, add synthetic request fixtures and assertions to the appropriate `scripts/audit/*.test.mjs` file. Cover both recognized requests and nearby formats that should be ignored. Never add real customer payloads to tests.

Run `pnpm test`. For capture or interface changes, also run `pnpm test:browser` and check the unpacked extension in Chrome. Browser checks use Playwright Chromium; no live customer website is required.

Generated ZIPs, local audit reports, and browser profiles do not belong in pull requests. Maintainers handle official version changes and store submissions.

## License

Contributions are made under this project's [Apache 2.0 license](LICENSE). Preserve existing attribution and identify any third-party code or assets included in your change.

## Vendor rules

Rules live in `extension/lib/rules/`, grouped by vendor. Each rule owns its stable `id`, default `severity`, documentation `source`, and `evaluate(event)` function. Evaluators receive a parsed request and return `{ text, fix }` when there is a finding, or `null` otherwise. They can use any JavaScript logic the check needs; there is no rule-expression language.

Add rules to the relevant vendor module. Register new vendor modules in `extension/lib/vendor-rules.mjs`. Shared payload checks live in `rules/payload.mjs`; their documentation source defaults to the event vendor's entry in `rules/sources.mjs`.

`extension/lib/rule-config.mjs` controls which vendors appear in best-practice results and optional per-rule settings:

```js
export const ruleSettings = {
  'ga4.purchase_value': { enabled: false },
  'meta.event_case': { severity: 'error' },
};
```

Unlisted rules keep their defaults. Supported severities are `error` and `warning`. Disabling or overriding a rule applies to the audit analyzer and the extension's checks. `bestPracticeVendors` controls the best-practice UI/export coverage; it does not disable the audit analyzer's other vendor checks. All configuration ships with the extension and requires a reload or updated distribution to take effect.
