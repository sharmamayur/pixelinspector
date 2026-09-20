# Pixel Inspector by PixelMonitor

An open-source Chrome extension for inspecting advertising and analytics requests as you browse. See which events fire, inspect their payloads, and follow the page visits and clicks that preceded them.

Pixel Inspector runs locally. No account, subscription, or PixelMonitor service is required. It is licensed under Apache 2.0.

## Install from source

Requires Chrome 116 or later. Node.js and pnpm are only needed for development and the optional command-line audit tool.

1. Download and extract this repository using **Code → Download ZIP**, or clone it:

   ```sh
   git clone https://github.com/sharmamayur/pixelinspector.git
   cd pixelinspector
   ```

2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the `extension` folder inside the extracted or cloned repository.
4. Pin **Pixel Inspector by PixelMonitor** from Chrome's extensions menu.

Keep the source folder on your computer: Chrome loads the extension from that location. If using a packaged extension ZIP instead, extract it and select the folder containing `manifest.json`.

## Use it

1. Open a website you own or are authorized to inspect, then click the extension's toolbar icon.
2. Inspection starts automatically. Refresh the website to capture requests made during page load.
3. Browse the site and expand events to inspect their payloads and Meta/GA4 best-practice findings. Each finding includes a suggested fix and vendor documentation. Search or filter by vendor to narrow the results.
4. Use **Pause** to stop capture and enable HTML, JSON, or plain-text exports. **Resume** continues recording. **Clear** removes the results and immediately starts a new recording.

While the panel is open, switching website tabs starts separate inspection sessions. Closing the panel does not stop an existing recording; use **Pause**. Closing a website tab deletes its session.

See the [user guide](extension/README.md) for supported vendors, troubleshooting, and capture limits.

## Privacy and limitations

Captured data stays in Chrome session storage and is not uploaded by the extension. Website payloads can contain personal identifiers, customer information, and purchase details. Downloaded reports remain on disk until you delete them; inspect and redact them before sharing.

The extension observes browser requests. It cannot verify server-side tracking, platform attribution, or final vendor receipt. Requests shown after an action are associated by timing, not proof that the action caused them.

Read the [extension privacy policy](extension/privacy.html) for details.

## Development and contributions

Requires Node.js 20 or later and pnpm. Run commands from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
```

There is no extension build step. After editing files in `extension`, click **Reload** on the extension's card at `chrome://extensions`, then refresh the website you are inspecting. Extension reloads clear its session data.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the project layout, bug reports, and pull requests. The optional [command-line audit tool](scripts/audit/README.md) runs repeatable browser journeys and saves local reports.

## Package from source

With pnpm and the `zip` command installed:

```sh
pnpm package:extension
```

The package is written to `dist/pixel-inspector-0.1.2.zip`, with `manifest.json`, `LICENSE`, and `NOTICE` at its root. The command replaces the contents of `dist`.

Official store publishing is a maintainer task; see the [store listing and release checklist](extension/store-listing.md). Building a package does not publish it.

## Support

Report bugs and request features through [GitHub Issues](https://github.com/sharmamayur/pixelinspector/issues). Include reproduction steps and sanitized examples, not private browsing captures or credentials. For sensitive reports, email [mayur@pixelmonitor.app](mailto:mayur@pixelmonitor.app).

## License

[Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for attribution.
