import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  favicon?: string;
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
  
  // Actions
  openSearchMode: (initialQuery?: string, initialResults?: SearchResult[], initialContent?: string) => void;
  closeSearch: () => void;
  setSearching: (isSearching: boolean) => void;
  
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
          });
        } else {
          // Open blank search mode (user can search from within)
          set({ isOpen: true });
        }
      },

      closeSearch: () => {
        set({ isOpen: false });
      },

      setSearching: (isSearching) => {
        set({ isSearching });
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
    }
  )
);
