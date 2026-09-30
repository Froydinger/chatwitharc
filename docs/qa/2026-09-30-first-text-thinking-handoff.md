# Thinking card hands off at first answer text

User screenshot showed answer text and the waiting card together. ChatResponseStatus deliberately rendered both during display-only streaming until full request completion. It now hides ThinkingIndicator immediately when a non-empty live answer belongs to the displayed session and is visible. This also removes the waiting/music helper contained in that indicator. Underlying activity, Stop, final-result persistence and queue admission still await actual request completion.

Actual-component browser handoff suite passes at 412/1280 normal/reduced motion: waiting indicator, first-text removal, no retained indicator on completion, cancel/error cleanup, no streaming replay and existing single answer fade. Targeted component lint and build pass. Existing test expectation was corrected from keeping the indicator through partial text to the requested first-text handoff.

No dashboard navigation, model, provider or voice changes. Voice Lab edits remain local and excluded from this commit.

## Authenticated live acceptance at 76026b14

Mac desktop normal reload recovered without the earlier prolonged blank window. Separate QA session 3ea99107-68a9-4179-b676-3ac2e771c308. Bounded native accessibility polling after Send: greeting first text and full idle observed together at 2406ms (sampling cannot separate their actual times). Longer three-bullet response first text observed at 7184ms, full completion at 11825ms. No answer/Thinking-card overlap in either run; longer response exposed first text while request remained active, proving the intended visual handoff separately from terminal cleanup. No finishing-response label. Latest assistant controls only; About modal showed Arc Think / Powered by GPT 6 & 6.1 without reasoning or empty tool list, then closed normally.

Screenshot Documents/ArcAI QA/2026-09-30/live-first-text-handoff.png. No audio, bug report submission, user draft alteration or deletion. Published Netlify revision 76026b1460d4ec1b92a89feaa412c2baf7b77595, deploy 6abd05981b2cc0000876eb56; live HTML/bootstrap returned 200. Voice Lab remains excluded.

Finish scope following user's correction: customer-facing animation cleanup and live chat handoff fixes; no further wholesale animation-runtime removal or speculative architecture expansion. Remaining provider entitlement/image quota, real local-model switching and audible playback acceptance are separate unproven checks, not evidence supplied by this fix.
