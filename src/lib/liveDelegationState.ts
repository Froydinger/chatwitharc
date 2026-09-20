// Responses delegation is independent of Live's speech/playback lifecycle.
// Keep completed tool calls until session reset so replayed events cannot run
// a tool twice. A response may complete with output: [] while tools are pending.
export class LiveDelegationState {
  private activeResponses = new Set<string>();
  private steeredDelegations = new Set<string | null>();
  private calls = new Map<string, { delegationId: string | null; responseId: string | null; delivered: boolean }>();

  responseStarted(delegationId: string | null, responseId: string | null) {
    const wasSteered = this.steeredDelegations.delete(delegationId);
    this.activeResponses.add(responseId || delegationId || 'unidentified');
    return wasSteered && ![...this.calls.values()].some(call => !call.delivered);
  }

  responseFinished(delegationId: string | null, responseId: string | null, steered = false) {
    this.activeResponses.delete(responseId || delegationId || 'unidentified');
    // A steered response has an automatic successor. Do not race it with an
    // explicit response.create while the successor's created event is in flight.
    if (steered) this.steeredDelegations.add(delegationId);
  }

  registerCall(callId: string, delegationId: string | null, responseId: string | null) {
    if (this.calls.has(callId)) return false;
    this.calls.set(callId, { delegationId, responseId, delivered: false });
    return true;
  }

  hasCall(callId: string) { return this.calls.has(callId); }
  markDelivered(callId: string) {
    const call = this.calls.get(callId);
    if (call) call.delivered = true;
  }

  get isBusy() {
    return this.activeResponses.size > 0 || this.steeredDelegations.size > 0 || [...this.calls.values()].some(call => !call.delivered);
  }

  reset() { this.activeResponses.clear(); this.steeredDelegations.clear(); this.calls.clear(); }
}
