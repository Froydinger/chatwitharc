# Thinking card hands off at first answer text

User screenshot showed answer text and the waiting card together. ChatResponseStatus deliberately rendered both during display-only streaming until full request completion. It now hides ThinkingIndicator immediately when a non-empty live answer belongs to the displayed session and is visible. This also removes the waiting/music helper contained in that indicator. Underlying activity, Stop, final-result persistence and queue admission still await actual request completion.

Actual-component browser handoff suite passes at 412/1280 normal/reduced motion: waiting indicator, first-text removal, no retained indicator on completion, cancel/error cleanup, no streaming replay and existing single answer fade. Targeted component lint and build pass. Existing test expectation was corrected from keeping the indicator through partial text to the requested first-text handoff.

No dashboard navigation, model, provider or voice changes. Voice Lab edits remain local and excluded from this commit.
