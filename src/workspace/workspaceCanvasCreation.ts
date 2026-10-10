export interface WorkspaceCanvasCreationContext {
  routeKey: string;
  pathname: string;
  search: string;
  ownerId: string | null;
  currentSessionId: string | null;
}

export interface WorkspaceCanvasCreationDependencies {
  readContext: () => WorkspaceCanvasCreationContext;
  getAuthenticatedOwnerId: () => Promise<string | null>;
  createSession: () => string;
  persistCanvas: (sessionId: string, ownerId: string) => Promise<string>;
  openCanvas: (sessionId: string) => void;
  navigate: (path: string) => void;
}

export type WorkspaceCanvasCreationResult =
  | { status: 'busy' }
  | { status: 'stale'; sessionId?: string; error?: unknown }
  | { status: 'failed'; error: unknown }
  | { status: 'opened'; sessionId: string }
  | { status: 'opened-unsaved'; sessionId: string; error: unknown };

/** Fences a delayed Workspace canvas save from changing the user's later route/account. */
export class WorkspaceCanvasCreationCoordinator {
  private generation = 0;
  private inFlight = false;

  get isInFlight() {
    return this.inFlight;
  }

  invalidate() {
    this.generation += 1;
    this.inFlight = false;
  }

  async create(dependencies: WorkspaceCanvasCreationDependencies): Promise<WorkspaceCanvasCreationResult> {
    if (this.inFlight) return { status: 'busy' };
    this.inFlight = true;
    const generation = ++this.generation;
    const isLive = () => this.generation === generation;
    let sessionId: string | undefined;

    try {
      const initial = dependencies.readContext();
      if (!initial.ownerId) return { status: 'failed', error: new Error('Sign in again and retry.') };

      const initialOwner = await dependencies.getAuthenticatedOwnerId();
      if (!isLive()) return { status: 'stale' };
      if (initialOwner !== initial.ownerId || !sameContext(initial, dependencies.readContext())) {
        return { status: 'stale', error: new Error('Your account or Workspace changed before the canvas could be created.') };
      }

      sessionId = dependencies.createSession();
      let saveError: unknown;
      try {
        const artifactId = await dependencies.persistCanvas(sessionId, initial.ownerId);
        if (!artifactId) throw new Error('The new canvas could not be attached to its chat.');
      } catch (error) {
        saveError = error;
      }

      let finalOwner: string | null;
      try {
        finalOwner = await dependencies.getAuthenticatedOwnerId();
      } catch (error) {
        return { status: 'stale', sessionId, error: saveError ?? error };
      }

      if (!isLive() || finalOwner !== initial.ownerId || !sameContext(initial, dependencies.readContext(), sessionId)) {
        return { status: 'stale', sessionId, ...(saveError ? { error: saveError } : {}) };
      }

      dependencies.openCanvas(sessionId);
      dependencies.navigate(`/chat/${encodeURIComponent(sessionId)}`);
      return saveError ? { status: 'opened-unsaved', sessionId, error: saveError } : { status: 'opened', sessionId };
    } catch (error) {
      return { status: 'failed', error };
    } finally {
      if (isLive()) this.inFlight = false;
    }
  }
}

function sameContext(
  expected: WorkspaceCanvasCreationContext,
  actual: WorkspaceCanvasCreationContext,
  expectedSessionId?: string,
) {
  return expected.routeKey === actual.routeKey
    && expected.pathname === actual.pathname
    && expected.search === actual.search
    && expected.ownerId === actual.ownerId
    && actual.currentSessionId === (expectedSessionId ?? expected.currentSessionId);
}
