# Search workspace native motion — local stage

SearchCanvas removes remaining Framer wrappers: grid-based retained panels for history, sources, saved links and selection actions; native CSS history hover, suggestion entrances/press, search entrance and spinner; SequencedTransition for suggestion loading/content swap. Mobile saved-link viewport remains 300px. Added accessible Saved links label.

Controller statement and all JSX event-handler parity passes against 014fe504. Actual component fixture with synthetic search data passed source open/close/reopen, history open/close, mobile saved-links open/close, searching state, reduced-motion entrance and no horizontal overflow at 412/1280. Fixture replaces sync with no-op and sends no search request. Restores local store/storage afterward. Fixture lint passes. Final build/prerender passed in 1.89 seconds.

Recorded 4.12 seconds of source/history panels; inspected frame with settled history panel. Durable video Documents/ArcAI QA/2026-09-30/arc-search-native-motion.mp4. Collapsed sources retain the existing hostname preview; that is intentional existing presentation.

Expanded browser suite passed saved-link selection/deselection bar and pending summary-conversation spinner at both widths, including reduced-motion stopping the spinner. SearchCanvas lint matches baseline: 9 existing errors and 2 warnings. Suggestion loading state is currently dormant (static fallback suggestions only); its native sequenced adapter has separate lifecycle coverage, but this stage does not claim the dormant branch was exercised in SearchCanvas. This does not prove authenticated live search/provider behavior. Dashboard navigation untouched.
