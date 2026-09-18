# Chrome Web Store review — September 19, 2026

Reviewed the repository against the complete [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies). This is a source, behavior, and asset review, not a guarantee of Google's approval. Publisher-account settings, ownership of branding, prior enforcement history, and the submitted dashboard contents are not available in this repository.

## Findings and fixes

| Policy area | Repository findings / disposition |
| --- | --- |
| Privacy; Limited Use; disclosure | Kept automatic inspection when the panel opens or the selected website tab changes, with a persistent visible data disclosure. A separate per-tab Start confirmation is not part of this UX. Added an offline extension-specific privacy policy. Public privacy URL returned HTTP 200 and already includes an extension section and Limited Use statement. |
| Data handling | Request decoding now occurs only after checking for an active inspection. Clear resets captured results and immediately starts a fresh recording; Pause stops capture. Same-URL reloads keep tracking. Click labels exclude editable text and input values. Payload data remains intentionally visible and exportable, so the listing warns about sensitive fields. No extension network upload code was found. |
| Permissions | All four API permissions are used: webRequest, storage, sidePanel, scripting. HTTP(S) host access supports cross-origin vendor requests and first-party analytics endpoints on arbitrary inspected sites. Restricting access to a vendor-domain list would break first-party collection inspection. No cookies, history, debugger, clipboard, downloads, or unrelated permissions requested. |
| Misleading behavior; listing accuracy | Exposed the previously hidden export controls, corrected plain-text summary download wording, documented capture continuing after panel closure, and updated reviewer instructions. Replaced promotional screenshot wording suggesting causal proof with a direct screenshot of the current UI. Event/action association is temporal; it does not prove causation. |
| Single purpose; minimum functionality; side-panel quality | Journey and marketing-request inspection, filters, payload display, and local exports serve the same purpose. Parser tests and Chromium smoke tests exercise these features. No search, homepage, or new-tab overrides. |
| Readable code; API use; Manifest V3 | Readable packaged JavaScript modules; no remote scripts, eval, executable remote configuration, or obfuscation found. Uses Chrome's webRequest, sidePanel, storage, scripting, and tab lifecycle APIs. |
| Malicious/prohibited products; mature content; hate/violence; regulated goods | No corresponding functionality or supplied content found in the extension or store assets. Tool observes requests; it does not bypass website access controls or initiate marketing requests. |
| Ads; affiliate ads; payments; deceptive installation | No ad injection, affiliate rewriting, billing, bundled installation, or installation funnel implemented in this repository. Hosted-service billing is separate from the extension. |
| Impersonation/IP | No claims of Chrome/Google endorsement found. Vendor names identify observed requests. Publisher must confirm rights to PixelMonitor branding and assets. |
| Spam/abuse; enforcement; account security | No automated messaging, notification spam, review solicitation, or enforcement circumvention code found. Account history, duplicate listings, contact delivery, and 2-Step Verification require publisher confirmation. |
| Featured-product guidance; Chrome Apps | Feature placement is Google's decision. This package is an extension, not a Chrome App. |

## Changes delivered

- Version 0.1.2 in the manifest and package metadata.
- Upload ZIP excludes store artwork and repository-facing documentation; runtime code and offline privacy page are included.
- Browser test covers automatic recording on panel open and tab switching, Pause/Resume, Clear followed by same-URL reload and an initial page-load pixel, navigation, exports, editable-text exclusion, and the offline privacy page.
- Existing `.gitignore` changes remain untouched by this review.

## Publisher checks before submission

1. Use `extension/store-listing.md` for the description, permission justifications, privacy notes, and reviewer steps. The arbitrary payload viewer can handle sensitive data locally; do not select “no user data” simply because there is no upload.
2. Enter `https://www.pixelmonitor.app/privacy` in the dashboard. The packaged policy is also available offline. Keep the public policy aligned with actual behavior. Confirm support mail reaches `mayur@pixelmonitor.app`.
3. Enable 2-Step Verification and confirm publisher identity/contact details and distribution regions. Confirm ownership or authorization for the branding and artwork.
4. Upload `dist/pixel-inspector-0.1.2.zip`, the refreshed 1280×800 screenshot, and the 440×280 promotional image. Check the dashboard preview and complete its certifications truthfully.
5. Do not describe the extension as verifying attribution, server-side tracking, or final vendor receipt. Do not promise that full payload exports are redacted.

## Scope limits

The public privacy page was read, but the hosted application's source, all marketing routes, account settings, and any existing submitted listing were not audited or modified. Google evaluates the complete submitted experience. No store submission was made.
