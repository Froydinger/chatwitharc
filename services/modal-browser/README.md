# Arc browser on Modal

The broker runs in the `arc-browser` Modal app. It creates a fresh CPU-only
sandbox for each Arc browser session. JTune is separate and is not modified.

## Components

- `app.py`: authenticated broker, provisioning, status, takeover, termination.
- `session.py`: Chromium, public-IP-pinned HTTPS proxy, CDP connection, JPEG
  live view, server-enforced human control, and bounded mouse/keyboard input.
- `view.html`: responsive live view, navigation controls, touch scrolling and
  a mobile text-entry row. No third-party scripts or stored browser credentials.
- `supabase/functions/_shared/browserProvider.ts`: chooses the provider for new
  sessions and uses persisted provider identity for existing sessions/cleanup.

The historical `browserbase_*` tool names and database table are compatibility
contracts. They can represent Modal sessions without changing saved chats.
Model access URLs never enter chat history. A separate viewer token cannot use
CDP or switch control. Only Arc's authenticated backend can switch ownership.

## Deployment

Use the existing Modal profile. Create `arc-browser-service` with a random
`ARC_BROWSER_SECRET`; store the same value server-side as
`MODAL_BROWSER_API_KEY`. Never commit or print either value.

```
modal deploy services/modal-browser/app.py
```

`MODAL_BROWSER_API_URL` is the deployed broker URL ending in `/v1`.
`ARC_BROWSER_PROVIDER=modal` enables new Modal sessions. With that unset and
`BROWSERBASE_ENABLED=false`, ordinary website-inspection requests use Tavily.
Deploy chat, browserbase-session, browserbase-cleanup, and cloud-worker together
when modifying their shared provider code. Apply the provider migration first.

## Cost and data boundaries

- CPU request 0.5 physical cores, hard limit 1; RAM request 1 GiB, limit 2 GiB.
- No GPU, no always-warm browser, no user profile volume.
- Three simultaneous sessions globally; ten-minute hard sandbox timeout;
  existing Arc cleanup closes sessions after five idle minutes while Arc owns it.
- Modal reservations have a separate 6,000-minute rolling 31-day ceiling. At
  published rates this bounds browser CPU/RAM around $6.32, excluding broker,
  networking and model charges. This is not a workspace-wide spend guarantee.
- Browserbase's 55-minute budget is not increased by this implementation.
- Page traffic is HTTPS through a proxy that validates every DNS result and
  connects to the checked public address. Private/loopback/link-local addresses
  and non-443 destinations are rejected. Chromium QUIC/non-proxied WebRTC and
  service workers are disabled.
- Screenshots are streamed, not retained. Browser state disappears with the
  sandbox. The broker dictionary contains ephemeral connection credentials;
  explicit close scrubs those credentials.

## Acceptance checks before enabling

Check actual create, navigation, reconnect, takeover, agent denial during human
control, handback, fresh snapshot, mobile text/scroll, and confirmed termination.
A deployed broker or passing TypeScript build alone is not browser proof.
