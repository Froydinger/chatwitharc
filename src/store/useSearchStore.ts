import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  favicon?: string;
}

export interface SourceMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
}

export interface SourceConversation {
  sourceUrl: string;
  sourceTitle: string;
  sourceSnippet: string;
  messages: SourceMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface SavedLink {
  id: string;
  title: string;
  url: string;
  snippet?: string;
  savedAt: number;
  listId: string;
}

export interface LinkList {
  id: string;
  name: string;
  createdAt: number;
  links: SavedLink[];
}

export interface SearchSession {
  id: string;
  query: string;
  results: SearchResult[];
  formattedContent: string;
  timestamp: number;
  relatedQueries?: string[];
  sourceConversations?: Record<string, SourceConversation>; // key = url
  activeSourceUrl?: string | null;
  currentTab?: 'search' | 'chats' | 'saved';
}

interface SearchState {
  isOpen: boolean;
  isSearching: boolean;

  // Session-based search
  sessions: SearchSession[];
  activeSessionId: string | null;

  // Link lists
  lists: LinkList[];

  // View state
  showLinksPanel: boolean;
  pendingSearchQuery: string | null; // Query to auto-search when canvas opens

  // Actions
  openSearchMode: (initialQuery?: string, initialResults?: SearchResult[], initialContent?: string) => void;
  closeSearch: () => void;
  setSearching: (isSearching: boolean) => void;
  setPendingSearchQuery: (query: string | null) => void;
  
  // Session actions
  addSession: (query: string, results: SearchResult[], formattedContent: string, relatedQueries?: string[]) => string;
  setActiveSession: (sessionId: string) => void;
  updateSession: (sessionId: string, updates: Partial<Omit<SearchSession, 'id' | 'timestamp'>>) => void;
  removeSession: (sessionId: string) => void;
  clearAllSessions: () => void;
  
  // Link list actions
  toggleLinksPanel: () => void;
  createList: (name: string) => string;
  deleteList: (listId: string) => void;
  renameList: (listId: string, newName: string) => void;
  saveLink: (link: Omit<SavedLink, 'id' | 'savedAt'>) => void;
  removeLink: (listId: string, linkId: string) => void;
  moveLink: (linkId: string, fromListId: string, toListId: string) => void;

  // Source conversation actions
  setCurrentTab: (sessionId: string, tab: 'search' | 'chats' | 'saved') => void;
  startSourceChat: (sessionId: string, source: SearchResult) => void;
  sendSourceMessage: (sessionId: string, sourceUrl: string, message: string, isLoading?: boolean) => Promise<void>;
  addSourceMessage: (sessionId: string, sourceUrl: string, message: SourceMessage) => void;
  setActiveSource: (sessionId: string, sourceUrl: string | null) => void;

  // Supabase sync
  syncToSupabase: () => Promise<void>;
  syncFromSupabase: () => Promise<void>;
  saveSessionToSupabase: (session: SearchSession) => Promise<void>;

  // Legacy compatibility
  query: string;
  results: SearchResult[];
  formattedContent: string;
  openSearch: (query: string, results: SearchResult[], formattedContent: string) => void;
}

export const useSearchStore = create<SearchState>()(
  persist(
    (set, get) => ({
      isOpen: false,
      isSearching: false,
      sessions: [],
      activeSessionId: null,
      showLinksPanel: false,
      pendingSearchQuery: null,
      lists: [
        {
          id: 'default',
          name: 'Saved Links',
          createdAt: Date.now(),
          links: [],
        },
      ],
      
      // Legacy computed properties
      get query() {
        const state = get();
        const activeSession = state.sessions.find(s => s.id === state.activeSessionId);
        return activeSession?.query ?? '';
      },
      get results() {
        const state = get();
        const activeSession = state.sessions.find(s => s.id === state.activeSessionId);
        return activeSession?.results ?? [];
      },
      get formattedContent() {
        const state = get();
        const activeSession = state.sessions.find(s => s.id === state.activeSessionId);
        return activeSession?.formattedContent ?? '';
      },

      openSearchMode: (initialQuery, initialResults, initialContent) => {
        const state = get();

        // If initial data provided (results and content), create a session
        if (initialResults && initialResults.length > 0 && initialContent) {
          const sessionId = crypto.randomUUID();
          const newSession: SearchSession = {
            id: sessionId,
            query: initialQuery || 'Web Search Results',
            results: initialResults,
            formattedContent: initialContent,
            timestamp: Date.now(),
          };

          set({
            isOpen: true,
            sessions: [...state.sessions, newSession],
            activeSessionId: sessionId,
            isSearching: false,
            pendingSearchQuery: null,
          });
        } else {
          // Open blank search mode - set pending query if provided
          set({
            isOpen: true,
            activeSessionId: null,
            pendingSearchQuery: initialQuery || null,
          });
        }
      },

      closeSearch: () => {
        set({ isOpen: false, pendingSearchQuery: null });
      },

      setSearching: (isSearching) => {
        set({ isSearching });
      },

      setPendingSearchQuery: (query) => {
        set({ pendingSearchQuery: query });
      },

      addSession: (query, results, formattedContent, relatedQueries) => {
        const id = crypto.randomUUID();
        const newSession: SearchSession = {
          id,
          query,
          results,
          formattedContent,
          timestamp: Date.now(),
          relatedQueries,
        };

        set((state) => ({
          sessions: [...state.sessions, newSession],
          activeSessionId: id,
        }));

        // Save to Supabase in background
        get().saveSessionToSupabase(newSession).catch(console.error);

        return id;
      },

      setActiveSession: (sessionId) => {
        set({ activeSessionId: sessionId });
      },

      updateSession: (sessionId, updates) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, ...updates } : s
          ),
        }));

        // Save updated session to Supabase
        const session = get().sessions.find((s) => s.id === sessionId);
        if (session) {
          get().saveSessionToSupabase(session).catch(console.error);
        }
      },

      removeSession: (sessionId) => {
        set((state) => {
          const newSessions = state.sessions.filter((s) => s.id !== sessionId);
          let newActiveId = state.activeSessionId;

          // If removing the active session, select another
          if (state.activeSessionId === sessionId) {
            newActiveId = newSessions.length > 0 ? newSessions[newSessions.length - 1].id : null;
          }

          return {
            sessions: newSessions,
            activeSessionId: newActiveId,
          };
        });
        // Sessions are only persisted locally via zustand persist - no Supabase table needed
      },

      clearAllSessions: () => {
        set({
          sessions: [],
          activeSessionId: null,
        });
      },

      toggleLinksPanel: () => {
        set((state) => ({ showLinksPanel: !state.showLinksPanel }));
      },

      createList: (name) => {
        const id = crypto.randomUUID();
        const newList: LinkList = {
          id,
          name,
          createdAt: Date.now(),
          links: [],
        };
        set((state) => ({
          lists: [...state.lists, newList],
        }));
        return id;
      },

      deleteList: (listId) => {
        if (listId === 'default') return;
        set((state) => ({
          lists: state.lists.filter((l) => l.id !== listId),
        }));
      },

      renameList: (listId, newName) => {
        set((state) => ({
          lists: state.lists.map((l) =>
            l.id === listId ? { ...l, name: newName } : l
          ),
        }));
      },

      saveLink: (link) => {
        const newLink: SavedLink = {
          ...link,
          id: crypto.randomUUID(),
          savedAt: Date.now(),
        };
        set((state) => ({
          lists: state.lists.map((l) =>
            l.id === link.listId ? { ...l, links: [...l.links, newLink] } : l
          ),
        }));
      },

      removeLink: (listId, linkId) => {
        set((state) => ({
          lists: state.lists.map((l) =>
            l.id === listId
              ? { ...l, links: l.links.filter((link) => link.id !== linkId) }
              : l
          ),
        }));
      },

      moveLink: (linkId, fromListId, toListId) => {
        const state = get();
        const fromList = state.lists.find((l) => l.id === fromListId);
        const link = fromList?.links.find((l) => l.id === linkId);
        if (!link) return;

        set((state) => ({
          lists: state.lists.map((l) => {
            if (l.id === fromListId) {
              return { ...l, links: l.links.filter((link) => link.id !== linkId) };
            }
            if (l.id === toListId) {
              return { ...l, links: [...l.links, { ...link, listId: toListId }] };
            }
            return l;
          }),
        }));
      },

      // Source conversation actions
      setCurrentTab: (sessionId, tab) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, currentTab: tab } : s
          ),
        }));
      },

      startSourceChat: (sessionId, source) => {
        const conversation: SourceConversation = {
          sourceUrl: source.url,
          sourceTitle: source.title,
          sourceSnippet: source.snippet,
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  sourceConversations: {
                    ...s.sourceConversations,
                    [source.url]: conversation,
                  },
                  activeSourceUrl: source.url,
                  currentTab: 'chats',
                }
              : s
          ),
        }));
      },

      sendSourceMessage: async (sessionId, sourceUrl, message, isLoading = false) => {
        const state = get();
        const session = state.sessions.find((s) => s.id === sessionId);
        if (!session) return;

        // Add user message
        const userMessage: SourceMessage = {
          id: crypto.randomUUID(),
          content: message,
          role: 'user',
          timestamp: Date.now(),
        };

        get().addSourceMessage(sessionId, sourceUrl, userMessage);

        // Don't call AI if in loading state (message will be added externally)
        if (isLoading) return;

        try {
          // Call AI with context about the source
          const conversation = session.sourceConversations?.[sourceUrl];
          const contextPrompt = `You are chatting about this source:\nTitle: ${conversation?.sourceTitle}\nURL: ${sourceUrl}\nSnippet: ${conversation?.sourceSnippet}\n\nUser: ${message}`;

          const { supabase } = await import('@/integrations/supabase/client');
          const { data, error } = await supabase.functions.invoke('chat', {
            body: {
              messages: [
                ...(conversation?.messages.map(m => ({
                  role: m.role,
                  content: m.content,
                })) || []),
                { role: 'user', content: contextPrompt },
              ],
            },
          });

          if (error) throw error;

          const assistantMessage: SourceMessage = {
            id: crypto.randomUUID(),
            content: data?.choices?.[0]?.message?.content || 'Sorry, I could not respond.',
            role: 'assistant',
            timestamp: Date.now(),
          };

          get().addSourceMessage(sessionId, sourceUrl, assistantMessage);
        } catch (error) {
          console.error('Source chat error:', error);
          const errorMessage: SourceMessage = {
            id: crypto.randomUUID(),
            content: 'Sorry, I encountered an error. Please try again.',
            role: 'assistant',
            timestamp: Date.now(),
          };
          get().addSourceMessage(sessionId, sourceUrl, errorMessage);
        }
      },

      addSourceMessage: (sessionId, sourceUrl, message) => {
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s;

            const conversation = s.sourceConversations?.[sourceUrl];
            if (!conversation) return s;

            return {
              ...s,
              sourceConversations: {
                ...s.sourceConversations,
                [sourceUrl]: {
                  ...conversation,
                  messages: [...conversation.messages, message],
                  updatedAt: Date.now(),
                },
              },
            };
          }),
        }));
      },

      setActiveSource: (sessionId, sourceUrl) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, activeSourceUrl: sourceUrl } : s
          ),
        }));
      },

      // Sync functions - sessions are stored locally via zustand persist
      // No Supabase table needed - localStorage is sufficient for search sessions
      syncToSupabase: async () => {
        // Sessions are already persisted locally via zustand persist middleware
        console.log('Search sessions synced locally');
      },

      syncFromSupabase: async () => {
        // Sessions are loaded from localStorage via zustand persist middleware
        console.log('Search sessions loaded from local storage');
      },

      saveSessionToSupabase: async (_session: SearchSession) => {
        // Sessions are saved locally via zustand persist middleware
        // No Supabase table needed
      },

      // Legacy compatibility - redirects to new session-based system
      openSearch: (query, results, formattedContent) => {
        get().openSearchMode(query, results, formattedContent);
      },
    }),
    {
      name: 'arc-search-store',
      partialize: (state) => ({
        lists: state.lists,
        sessions: state.sessions,
      }),
      merge: (persistedState: any, currentState: SearchState) => {
        // Ensure we always have at least the default list
        const persistedLists = persistedState?.lists || [];
        const hasDefaultList = persistedLists.some((l: LinkList) => l.id === 'default');
        
        const lists = hasDefaultList 
          ? persistedLists 
          : [
              {
                id: 'default',
                name: 'Saved Links',
                createdAt: Date.now(),
                links: [],
              },
              ...persistedLists,
            ];

        return {
          ...currentState,
          ...persistedState,
          lists,
          sessions: persistedState?.sessions || [],
        };
      },
    }
  )
);
