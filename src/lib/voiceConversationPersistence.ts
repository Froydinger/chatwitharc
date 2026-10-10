import type { Message } from '@/store/useArcStore';
import type { useVoiceModeStore } from '@/store/useVoiceModeStore';

type Turn = ReturnType<typeof useVoiceModeStore.getState>['conversationTurns'][number];
type VoiceMessage = Omit<Message, 'id' | 'timestamp'> & { id?: string; timestamp?: Date };
export interface VoiceConversationPersistence {
  sessionId: string;
  savedTurnCount: number;
  isCurrent: () => boolean;
  getMessages: () => Message[];
  addMessage: (message: VoiceMessage) => Promise<string>;
  replaceMessage: (id: string, message: Omit<Message, 'id' | 'timestamp'>) => Promise<void>;
  saveTurns: (final?: boolean) => Promise<number>;
  captureTurns: (turns: Turn[]) => void;
  hasUnsavedUserTurn: () => boolean;
}

/** Per-call persistence only. Audio, transport, prompts and turn production stay
 * with the existing controller. Every asynchronous completion retains its owner. */
export function createVoiceConversationPersistence(input: {
  sessionId: string; callId: string;
  canWrite: () => boolean; isCurrent: () => boolean;
  getMessages: () => Message[]; readTurns: () => Turn[];
  attachImageToLastAssistantTurn: () => void;
  append: (message: VoiceMessage, options: { sessionId: string; beforeMessageId?: string }) => Promise<string>;
  patch: (sessionId: string, id: string, message: Partial<Message>, persist: boolean) => Promise<void>;
}): VoiceConversationPersistence {
  type CapturedTurn = { id: string; original: Turn; turn: Turn };
  let snapshot: CapturedTurn[] = [];
  const identities = new WeakMap<Turn, string>();
  const saved = new Map<string, string>();
  let nextIdentity = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const checkOwner = () => { if (!input.canWrite()) throw new Error('Voice conversation owner is no longer available.'); };
  const persistence: VoiceConversationPersistence = {
    sessionId: input.sessionId, savedTurnCount: 0,
    isCurrent: input.isCurrent, getMessages: input.getMessages,
    addMessage: message => { checkOwner(); return input.append(message, { sessionId: input.sessionId }); },
    replaceMessage: (id, message) => {
      checkOwner();
      return input.patch(input.sessionId, id, { ...message, timestamp: new Date(), sourceModel: message.role === 'assistant' ? (message.sourceModel || 'cloud-chat') : undefined }, true);
    },
    hasUnsavedUserTurn: () => snapshot.some(item => item.turn.role === 'user' && item.turn.transcript.trim() && !saved.has(item.id)),
    captureTurns: turns => {
      const originals = new Set(turns);
      snapshot = turns.map((turn, index) => {
        let id = turn.liveCaptionId ? `voice-caption-${turn.liveCaptionId}` : identities.get(turn);
        if (!id) {
          // The store replaces a turn object when attaching its final image.
          // Preserve that identity without treating repeated equal utterances as one.
          const previous = snapshot[index];
          const replaced = previous && !originals.has(previous.original)
            && previous.turn.role === turn.role && +new Date(previous.turn.timestamp) === +new Date(turn.timestamp)
            && previous.turn.transcript === turn.transcript;
          id = replaced ? previous.id : `voice-${input.callId}-${nextIdentity++}`;
        }
        identities.set(turn, id);
        return { id, original: turn, turn: { ...turn } };
      });
    },
    saveTurns: (final = false) => {
      // Capture before entering the queue: a later call can replace global turns.
      if (input.isCurrent()) {
        if (final) input.attachImageToLastAssistantTurn();
        persistence.captureTurns(input.readTurns());
      }
      const captured = snapshot;
      const operation = async () => {
        checkOwner();
        let count = 0;
        for (let index = 0; index < captured.length; index++) {
          const { id, turn } = captured[index];
          if (!turn.transcript.trim() && !turn.imageUrl) continue;
          const webSearch = turn.webSearch;
          const message: VoiceMessage = {
            id, timestamp: new Date(turn.timestamp),
            content: turn.imageUrl ? (turn.transcript || 'Generated image') : turn.transcript,
            role: turn.role, type: turn.imageUrl ? 'image' : 'text', imageUrl: turn.imageUrl,
            sourceModel: turn.role === 'assistant' ? 'cloud-voice' : undefined,
            modelUsed: turn.role === 'assistant' ? 'gpt-live-1' : undefined,
            webSources: webSearch?.sources, searchImages: webSearch?.images,
            memoryAction: webSearch ? { type: 'web_searched', content: webSearch.summary, sources: webSearch.sources, query: webSearch.query, searchProvider: webSearch.provider } : undefined,
            locationUsed: webSearch?.locationUsed,
          };
          const fingerprint = JSON.stringify(message);
          if (saved.get(id) === fingerprint) continue;
          checkOwner();
          if (saved.has(id)) {
            // A finalized image/transcript update belongs to the same saved row.
            await input.patch(input.sessionId, id, message, true);
          } else {
            const beforeMessageId = captured.slice(index + 1).find(item => saved.has(item.id))?.id;
            await input.append(message, { sessionId: input.sessionId, ...(beforeMessageId ? { beforeMessageId } : {}) });
            count++;
          }
          saved.set(id, fingerprint);
          persistence.savedTurnCount = saved.size;
        }
        return count;
      };
      const result = queue.then(operation, operation);
      queue = result.catch(() => undefined);
      return result;
    },
  };
  return persistence;
}
