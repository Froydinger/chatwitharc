# Authenticated queue acceptance

Mac ArcAI desktop, September 30, after Force Reload against published frontend 014fe504. Existing authenticated session, no credentials extracted. Original saved chat preserved. Fresh QA chat f0210546-5c71-492c-8d5c-2d849b2df7b0.

Sent a five-section bicycle question. While Thinking, typed “What is 2 plus 2?” and pressed Enter. One queued item appeared with matching content. First response completed before attempted Stop click; stale control rejected the click. This does NOT prove Stop-with-queue behavior.

Explicit Pause switched to Resume and disabled manual send controls. Opened a fresh chat (785ec91c-7286-4be2-a8b8-492e36966870): queue stayed held and UI said to open original chat/mode. Dashboard history reopened original bicycle chat with the paused request intact. After observed Resume activation, queue drained, exactly one follow-up user message appeared, response was “4”, and terminal state cleared Thinking/Stop/queue. Only newest assistant reply exposed About/Copy/Read Aloud. Saved screenshot Documents/ArcAI QA/2026-09-30/live-queue-complete.png.

Limitations/anomalies: initial Force Reload briefly retained old UI, then blank for over 15 seconds; opening DevTools restored page content, cause unestablished. No visible error panel was captured and no diagnostic credentials read. First Resume attempt did not produce observed state change during 20-second polling; a fresh click visibly switched to Pause and then drained. Do not count first attempt as successful activation or claim why it failed. Timings were split across UI calls and are not valid TTFT/completion measurements. No attachments, failure/manual retry, active Stop-with-queue, local model or image quota E2E in this pass. No report submitted or audio played.

## Follow-up: Stop with queue and newer draft

In the same authenticated QA chat, sent a ten-section bicycle-history request, observed active Thinking, queued “What is 3 plus 3?”, observed exactly one queued item, then clicked fresh Stop control, all in one bounded native UI sequence (2.383 seconds total including typing/queueing). Terminal state immediately showed idle composer, no Thinking/Stop, Resume queue and disabled Next/Send now; active user message remained. Screenshot: live-stop-paused-queue.png.

Typed a new unsent QA draft while queue remained paused. Resume visibly dispatched the captured request, returned “6”, emptied queue and cleared Thinking/Stop. Final state retained the exact newer draft. Resume-to-observed terminal took 8.265 seconds, including queue scheduling and UI observations; this is not provider latency or TTFT. Screenshot: live-queue-draft-preserved.png. Cleared only the QA-authored draft afterward; no chats deleted, no user draft overwritten. Latest assistant action-row ownership remained correct.

This closes authenticated Stop-with-queue and newer-draft preservation acceptance for ordinary text in this account. Still no attachment, failed-request manual retry, free-tier admission, image credit/refund or local-model generation proof. UI cancellation does not establish immediate upstream billing cancellation.
