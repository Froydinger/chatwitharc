# Ask ArcAI — next update

Version 1.0 build 5 was submitted October 3, 2026 and verified Waiting for Review. Jake changed release preference to automatic release after approval. Keep EU storefronts excluded until an approved business-address solution and trader disclosure are in place. Do not rebuild or resubmit this version for the follow-ups below.

## Requested follow-ups

- **Animation and transition polish.** Jake reports glitches between some screens in the installed app. Identify the affected transitions with actual iPhone/iPad interaction, check reduced motion and interrupted navigation, then fix the observed problems. Specific failing flows have not yet been identified.
- **Apple in-app purchases.** Add optional StoreKit purchasing in a later release. Version 1.0 has no StoreKit products; existing Stripe checkout is permitted only by the actual United States iOS storefront gate. Plan App Store products, purchase verification, entitlement reconciliation, restores and subscription management. New paid agreements or legal terms require Jake's approval.
- **On-device models and Apple Intelligence.** Investigate native inference and Apple's supported intelligence APIs as future options. The current local web inference path is not evidence of a verified native model engine. Check device/OS requirements, download sizes, storage, offline behavior and privacy before promising support.
- **Duo layout QA.** Apple's official Xcode 27.1 beta advertises Duo simulation, and its device type is installed. The exact beta is at `/Volumes/J Drive/Developer/Applications/Xcode-Duo-27.1-beta.app`; installed runtimes are 27.0 and 27.2. Both rejected Duo creation, and even the exact beta reports iOS 27.1 unavailable to download. Obtain an official compatible runtime, then test folded/unfolded layouts, safe areas, keyboard, chat/sidebar, Canvas and voice. Do not claim verified Duo readiness yet.
- **Voice marketing screenshot.** Current submission has nine iPhone screenshots and one iPad screenshot. The fuller Canvas sample replaced the rejected sparse concept. Capture actual connected voice after explicit approval for ambient microphone audio transmission, then add a matching Manrope dark screenshot in a future editable listing. Do not invent a connected voice state.
- **EU distribution and business address.** Investigate an affordable legitimate P.O. box/business mailing address associated with Jacob as sole proprietor. No private home address was approved for publication. EU distribution is excluded; the web app remains accessible there. Re-enable EU only after Jake approves the public disclosure and Apple accepts the documentation.

## TestFlight to public release

TestFlight beta updates do not automatically become App Store installations. Once Ask ArcAI is live, install its public App Store version. Current beta update target is build 5 with the dashboard tile-corner fix. Build 5 is assigned to the existing Arc Owner QA TestFlight group. Jake must install the beta update in TestFlight; no physical-phone installation was performed during this assignment.

## Release boundaries

No public reviewer demo is required: Apple has a separate ordinary reviewer account with no access to Jake's data. Do not activate unfinished public demo/provider-budget code. Preserve the submitted build, existing accounts and unrelated Voice Lab work. Finish web parity separately; do not deploy native/demo/APNs drafts as part of a frontend visual release.

## Changes prepared after submission

- Left-edge rightward swipe opens chat history; right-edge leftward swipe opens the full dashboard. Horizontal intent, distance, modal and text-input guards remain. Gesture unit checks passed; device interaction still needs verification before the next upload.
- Page scrollbars are hidden while scrolling remains enabled, including dashboard. These source changes are not in submitted build 5.
- Cross-platform QA: GitHub new connection currently uses window.location.assign and the callback returns to the public web dashboard. Native return-to-app needs explicit verification/fix; already-connected repository operations share the same account-backed APIs. App Builder Sandpack preview runs in an iframe; test WKWebView compilation, preview network requests, generated app auth/storage, keyboard and project reopen. ZIP export already uses native sharing before the browser download fallback. Verify live-preview iframe controls and external-link behavior on device. Do not claim these flows passed merely because their source is shared.

- **Corrected store screenshots.** Jake approved holding the current submission and replacing assets for the first update or a required resubmission. Prepare distinct feature screens, primarily dark, with Manrope: a clear standalone Ask feature, Reflect/Living Memory, Create/images, full Canvas, dashboard, verified voice and App Builder where actually available. Avoid repeated light/dark examples occupying feature slots; target ten useful phone screenshots. A voice capture still requires the pending microphone transmission approval.
- **App Builder GitHub handoff.** Its separate connect action also uses top-level OAuth navigation; include it in the native return-to-app QA/fix. Verify clipboard copy/paste, external links, ZIP save/share, generated preview auth/storage and iframe interactions.
