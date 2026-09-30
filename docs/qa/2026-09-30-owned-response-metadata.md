# Owned response metadata

Four Canvas/code completion paths previously tagged only active state.messages after correctly owner-scoped content upserts. Model/source metadata could be absent when reopening the submitting chat. These paths now await an owner-scoped patch/save. Local flush and final save share the same cancellation/account/session guard.

Actual production adapter extracted from ChatInput passes original-session metadata routing, cancelled/account-changed/unowned completion rejection, and held persistence keeping completion pending. Production store action tests pass active/inactive owner, deleted target, no truncation and final metadata persistence. Submission, activity and asynchronous finalization regressions pass. Build/prerender passes (1.88 seconds). ChatInput lint remains preexisting noise: 47 errors and 7 warnings, fewer errors than before this change. No full lint-clean claim.

No provider routing, authentication, dashboard navigation, voice or Builder behavior changes. Evidence is source and production functions with synthetic persistence; authenticated Canvas/code completion during chat switching remains runtime acceptance work.
