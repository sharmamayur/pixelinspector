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

For parser changes, add synthetic request fixtures and assertions to the appropriate `scripts/audit/*.test.mjs` file. Cover both recognized requests and nearby formats that should be ignored. Never add real customer payloads to tests.

Run `pnpm test`. For capture or interface changes, also run `pnpm test:browser` and check the unpacked extension in Chrome. Browser checks use Playwright Chromium; no live customer website is required.

Generated ZIPs, local audit reports, and browser profiles do not belong in pull requests. Maintainers handle official version changes and store submissions.

## License

Contributions are made under this project's [Apache 2.0 license](LICENSE). Preserve existing attribution and identify any third-party code or assets included in your change.
