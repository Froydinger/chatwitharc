# Authenticated live desktop chat acceptance

Verified September 30 against frontend release `c9b2be9c` at askarc.chat using the existing signed-in ArcAI Mac desktop window through native UI automation. The in-app browser remains signed out. No authentication bypass, credential extraction, account creation, or entitlement changes were used. User requested remaining QA on Mac after taking the Pixel away.

The desktop window initially showed an old cached Flynn label. View → Force Reload loaded the current Arc Think/Arc Flash picker and preserved the original saved conversation. A transient blank render eventually recovered; it was not established as a permanent production failure.

Separate QA conversations were created; the original conversation was not edited or deleted.

## Client observations

| Case | First answer observed | Completion/idle observed | Result |
| --- | --- | --- | --- |
| Fresh `hey`, Think selected, Auto routed to Flash | 1,956 ms | 1,956 ms | Reply visible; Thinking/Stop gone; Type or talk restored |
| Bicycle balance question, two sentences | 7,299 ms | 11,267 ms | Reply visible before completion; terminal cleanup restored input |
| Stop during early request preparation | No answer before Stop | 999 ms for submit → Stop → idle | Thinking/Stop removed; submitted user message retained |

Times are native accessibility observations measured from click initiation, not network instrumentation. For the greeting, text and idle appeared in the same sample; this does not resolve separate sub-sample TTFT/completion values. An earlier greeting was only inspected at 19.8s and is excluded from timing conclusions because observation started late.

The two-answer conversation showed only the latest assistant's Arc/Copy/Read Aloud controls. The live reply-details modal showed Arc Flash / Powered by Gemini Flash for the fast greeting, with no reasoning disclosure or empty tool list. Report a bug opened the actual form; Cancel closed it without sending a report. Copy and Read Aloud were present, but clipboard contents and audible playback were not tested in this pass.

Visual evidence: `/Users/jakefreudinger/Documents/ArcAI QA/2026-09-30/live-greeting-complete.png`.

## Server timing cross-check

Read-only Supabase unified logs, project `jpqtoixhjnfdubvqshwk`, explicit UTC window 11:10–11:18. Only requested timing labels and sanitized cancellation classification were returned. The unified stream uses source `function_logs` and top-level `event_message`, not `function_edge_logs` or an event_message map attribute.

Executions below align with the UI test order and clocks; correlation is by timing, not independently captured client request IDs.

- Fresh greeting / `65c84a50`: context 145 ms; provider and first-answer timing 802 ms (Flash), at 11:16:06.347 UTC.
- Normal question / `142ec7d0`: context 292 ms; session creation 1,278 ms; first display-only answer 5,773 ms from provider-start clock; terminal polling 8,374 ms after session creation, 9 polls, zero tool calls. Terminal record at 11:15:02.635 UTC.
- Early Stop / `9af3b4e9`: context 242 ms; session creation 931 ms; first server display-answer timing 4,832 ms; pipeline cancellation recorded at 11:15:43.538 UTC. Client cleanup preceded server cancellation, so immediate upstream cancellation is not proven. No successful terminal-agent-result record was returned for this execution.

## Remaining boundaries

This verifies actual signed-in desktop chat submission, two successful replies, early cancellation UI, persisted existing history after reload, current model attribution, and bug-report opening. It does not prove free-tier limits, quota charging/refunds, paid checkout, image generation/editing, tools in a real turn, audio playback, queue cancellation, provider cancellation latency under every phase, or physical Pixel behavior. Those must not be inferred from this pass.
