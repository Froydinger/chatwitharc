# Local response ownership fix

Local token flush previously patched only visible state.messages; final editMessage targeted currentSessionId and truncated later messages. Switching chats could leave the original local placeholder unfinished. Local flush and final commit now use patchOwnedMessage with the captured original session. Cancellation/account checks precede each patch. Final content, local source metadata and memory metadata save together, and completion awaits persistence. Existing user edit semantics remain unchanged.

Production store-action regression tests passed: inactive owner leaves current chat untouched, active owner updates visible messages, later messages remain, deleted session/missing message are not recreated, final metadata saves to owner, and a held save holds completion. Existing submission/cancellation/activity/finalization tests passed. Build/prerender passed in 1.83 seconds before unused binding removal; final build repeated before release.

Existing broad ChatInput/store lint diagnostics remain; this is not a whole-repo lint-clean claim. No provider, voice, authentication, quota, Work/Builder or dashboard navigation changes. Evidence is production-action execution with synthetic persistence. Actual local-model generation while switching chats still requires runtime acceptance.
