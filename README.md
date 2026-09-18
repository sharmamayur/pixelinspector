# Pixel Inspector by PixelMonitor

Pixel Inspector is an open-source Chrome extension that shows marketers which advertising and analytics events a website sends, the payload fields included with each event, and the visitor action that preceded it.

Inspection data stays in the browser's session storage and is not uploaded to PixelMonitor. Pixel Inspector observes browser requests; it cannot verify server-side events, attribution, or final receipt by an advertising platform.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `extension` directory.
4. Open a regular website and click the Pixel Inspector toolbar icon.

See [`extension/README.md`](extension/README.md) for usage, supported vendors, privacy details, and product limitations.

## Development

Pixel Inspector has no build step. The source in `extension` is the exact code Chrome runs.

```sh
pnpm install
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
```

Create a Chrome Web Store upload with:

```sh
pnpm package:extension
```

The ZIP is written to `dist/pixel-inspector-0.1.2.zip` with `manifest.json` at its root.

## Contributing

Bug reports and additions for advertising or analytics vendors are welcome. Include a sanitized request URL or payload, the expected vendor and event classification, and a test that demonstrates the requested behavior. Do not commit customer data, credentials, or private browsing captures.

## License

Apache License 2.0. See [`LICENSE`](LICENSE).
