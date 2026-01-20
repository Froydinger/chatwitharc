import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/integrations/supabase/client';

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
  summaryConversation?: SourceMessage[]; // Follow-up conversation within the summary
}

interface SearchState {
  isOpen: boolean;
  isSearching: boolean;
  isSyncing: boolean;

  // Session-based search
  sessions: SearchSession[];
  activeSessionId: string | null;

  // Link lists
  lists: LinkList[];

  // View state
  showLinksPanel: boolean;
  pendingSearchQuery: string | null; // Query to auto-search when canvas opens
  globalCurrentTab: 'search' | 'chats' | 'saved'; // Global tab state independent of sessions

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

  // Summary conversation actions
  sendSummaryMessage: (sessionId: string, message: string) => Promise<void>;
  addSummaryMessage: (sessionId: string, message: SourceMessage) => void;

  // Supabase sync
  syncToSupabase: () => Promise<void>;
  syncFromSupabase: () => Promise<void>;
  saveSessionToSupabase: (session: SearchSession) => Promise<void>;
  deleteSessionFromSupabase: (sessionId: string) => Promise<void>;
  saveLinkToSupabase: (link: SavedLink, listName: string) => Promise<void>;
  deleteLinkFromSupabase: (linkId: string) => Promise<void>;

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
      isSyncing: false,
      sessions: [],
      activeSessionId: null,
      showLinksPanel: false,
      pendingSearchQuery: null,
      globalCurrentTab: 'search',
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

          // Save to Supabase in background
          get().saveSessionToSupabase(newSession).catch(console.error);
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

        // Delete from Supabase in background
        get().deleteSessionFromSupabase(sessionId).catch(console.error);
      },

      clearAllSessions: () => {
        const state = get();
        // Delete all sessions from Supabase
        state.sessions.forEach((session) => {
          get().deleteSessionFromSupabase(session.id).catch(console.error);
        });

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
        const state = get();
        const list = state.lists.find((l) => l.id === listId);
        
        // Delete all links in the list from Supabase
        if (list) {
          list.links.forEach((link) => {
            get().deleteLinkFromSupabase(link.id).catch(console.error);
          });
        }

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
        
        // Update all links in this list in Supabase with new list name
        const state = get();
        const list = state.lists.find((l) => l.id === listId);
        if (list) {
          list.links.forEach((link) => {
            get().saveLinkToSupabase(link, newName).catch(console.error);
          });
        }
      },

      saveLink: (link) => {
        const newLink: SavedLink = {
          ...link,
          id: crypto.randomUUID(),
          savedAt: Date.now(),
        };
        
        const state = get();
        const list = state.lists.find((l) => l.id === link.listId);
        const listName = list?.name || 'Saved Links';

        set((state) => ({
          lists: state.lists.map((l) =>
            l.id === link.listId ? { ...l, links: [...l.links, newLink] } : l
          ),
        }));

        // Save to Supabase in background
        get().saveLinkToSupabase(newLink, listName).catch(console.error);
      },

      removeLink: (listId, linkId) => {
        set((state) => ({
          lists: state.lists.map((l) =>
            l.id === listId
              ? { ...l, links: l.links.filter((link) => link.id !== linkId) }
              : l
          ),
        }));

        // Delete from Supabase in background
        get().deleteLinkFromSupabase(linkId).catch(console.error);
      },

      moveLink: (linkId, fromListId, toListId) => {
        const state = get();
        const fromList = state.lists.find((l) => l.id === fromListId);
        const toList = state.lists.find((l) => l.id === toListId);
        const link = fromList?.links.find((l) => l.id === linkId);
        if (!link || !toList) return;

        const updatedLink = { ...link, listId: toListId };

        set((state) => ({
          lists: state.lists.map((l) => {
            if (l.id === fromListId) {
              return { ...l, links: l.links.filter((link) => link.id !== linkId) };
            }
            if (l.id === toListId) {
              return { ...l, links: [...l.links, updatedLink] };
            }
            return l;
          }),
        }));

        // Update in Supabase
        get().saveLinkToSupabase(updatedLink, toList.name).catch(console.error);
      },

      // Source conversation actions
      setCurrentTab: (sessionId, tab) => {
        set((state) => ({
          globalCurrentTab: tab,
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

        // Save updated session to Supabase
        const session = get().sessions.find((s) => s.id === sessionId);
        if (session) {
          get().saveSessionToSupabase(session).catch(console.error);
        }
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

        // Save updated session to Supabase
        const session = get().sessions.find((s) => s.id === sessionId);
        if (session) {
          get().saveSessionToSupabase(session).catch(console.error);
        }
      },

      setActiveSource: (sessionId, sourceUrl) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, activeSourceUrl: sourceUrl } : s
          ),
        }));
      },

      // Summary conversation actions
      sendSummaryMessage: async (sessionId, message) => {
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

        get().addSummaryMessage(sessionId, userMessage);

        try {
          // Build context from all search results
          const resultsContext = session.results
            .map(r => `Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}`)
            .join('\n\n');

          const contextPrompt = `You are having a conversation about this search summary for "${session.query}":\n\n${session.formattedContent}\n\nSearch Results:\n${resultsContext}\n\nUser: ${message}`;

          const { data, error } = await supabase.functions.invoke('chat', {
            body: {
              messages: [
                ...(session.summaryConversation?.map(m => ({
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

          get().addSummaryMessage(sessionId, assistantMessage);
        } catch (error) {
          console.error('Summary chat error:', error);
          const errorMessage: SourceMessage = {
            id: crypto.randomUUID(),
            content: 'Sorry, I encountered an error. Please try again.',
            role: 'assistant',
            timestamp: Date.now(),
          };
          get().addSummaryMessage(sessionId, errorMessage);
        }
      },

      addSummaryMessage: (sessionId, message) => {
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s;

            return {
              ...s,
              summaryConversation: [...(s.summaryConversation || []), message],
            };
          }),
        }));

        // Update in Supabase
        const session = get().sessions.find(s => s.id === sessionId);
        if (session) {
          get().saveSessionToSupabase(session).catch(console.error);
        }
      },

      // Supabase sync functions
      syncToSupabase: async () => {
        const state = get();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.log('No user logged in, skipping sync to Supabase');
          return;
        }

        set({ isSyncing: true });

        try {
          // Sync all sessions
          for (const session of state.sessions) {
            await get().saveSessionToSupabase(session);
          }

          // Sync all links
          for (const list of state.lists) {
            for (const link of list.links) {
              await get().saveLinkToSupabase(link, list.name);
            }
          }

          console.log('✅ Synced search data to Supabase');
        } catch (error) {
          console.error('Failed to sync to Supabase:', error);
        } finally {
          set({ isSyncing: false });
        }
      },

      syncFromSupabase: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.log('No user logged in, skipping sync from Supabase');
          return;
        }

        set({ isSyncing: true });

        try {
          // Fetch search sessions from Supabase
          const { data: sessionsData, error: sessionsError } = await supabase
            .from('search_sessions' as any)
            .select('*')
            .order('created_at', { ascending: false });

          if (sessionsError) {
            console.error('Error fetching search sessions:', sessionsError);
          } else if (sessionsData && sessionsData.length > 0) {
            const sessions: SearchSession[] = sessionsData.map((s: any) => {
              // Ensure formattedContent is not empty
              const formattedContent = s.formatted_content || '';
              if (!formattedContent.trim()) {
                console.warn(`Session ${s.id} has empty formatted_content, using fallback`);
              }

              return {
                id: s.id,
                query: s.query,
                results: s.results || [],
                formattedContent: formattedContent || `Search results for "${s.query}"`,
                timestamp: new Date(s.created_at).getTime(),
                relatedQueries: s.related_queries || [],
                sourceConversations: s.source_conversations || {},
                summaryConversation: s.summary_conversation || [],
              };
            });

            // Merge with local sessions - combine best of both
            const state = get();
            const mergedSessions: SearchSession[] = [];
            const supabaseSessionMap = new Map(sessions.map(s => [s.id, s]));
            const localSessionMap = new Map(state.sessions.map(s => [s.id, s]));

            // Process all Supabase sessions, merging with local data
            sessions.forEach(supabaseSession => {
              const localSession = localSessionMap.get(supabaseSession.id);

              if (localSession) {
                // Merge: use better content and combine conversations
                const mergedSession: SearchSession = {
                  ...supabaseSession,
                  // Use local content if Supabase is empty
                  formattedContent: supabaseSession.formattedContent.trim()
                    ? supabaseSession.formattedContent
                    : localSession.formattedContent,
                  // Merge summaryConversation - use whichever has more messages
                  summaryConversation: (supabaseSession.summaryConversation?.length || 0) >= (localSession.summaryConversation?.length || 0)
                    ? supabaseSession.summaryConversation
                    : localSession.summaryConversation,
                  // Merge sourceConversations
                  sourceConversations: {
                    ...localSession.sourceConversations,
                    ...supabaseSession.sourceConversations,
                  },
                };
                mergedSessions.push(mergedSession);
              } else {
                mergedSessions.push(supabaseSession);
              }
            });

            // Add local-only sessions (not in Supabase yet)
            state.sessions.forEach(localSession => {
              if (!supabaseSessionMap.has(localSession.id)) {
                mergedSessions.push(localSession);
              }
            });

            set({ sessions: mergedSessions });
            console.log(`✅ Loaded ${sessions.length} search sessions from Supabase, merged with ${state.sessions.length} local sessions`);
          }

          // Fetch saved links from Supabase
          const { data: linksData, error: linksError } = await supabase
            .from('saved_links' as any)
            .select('*')
            .order('saved_at', { ascending: false });

          if (linksError) {
            console.error('Error fetching saved links:', linksError);
          } else if (linksData && linksData.length > 0) {
            // Group links by list_id
            const linksByList: Record<string, { name: string; links: SavedLink[] }> = {};
            
            linksData.forEach((l: any) => {
              const listId = l.list_id || 'default';
              if (!linksByList[listId]) {
                linksByList[listId] = {
                  name: l.list_name || 'Saved Links',
                  links: [],
                };
              }
              linksByList[listId].links.push({
                id: l.id,
                title: l.title,
                url: l.url,
                snippet: l.snippet,
                savedAt: new Date(l.saved_at).getTime(),
                listId: listId,
              });
            });

            // Build lists array
            const lists: LinkList[] = [];
            
            // Always include default list
            lists.push({
              id: 'default',
              name: linksByList['default']?.name || 'Saved Links',
              createdAt: Date.now(),
              links: linksByList['default']?.links || [],
            });

            // Add other lists
            Object.entries(linksByList).forEach(([listId, data]) => {
              if (listId !== 'default') {
                lists.push({
                  id: listId,
                  name: data.name,
                  createdAt: Date.now(),
                  links: data.links,
                });
              }
            });

            set({ lists });
            console.log(`✅ Loaded ${linksData.length} saved links from Supabase`);
          }
        } catch (error) {
          console.error('Failed to sync from Supabase:', error);
        } finally {
          set({ isSyncing: false });
        }
      },

      saveSessionToSupabase: async (session: SearchSession) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        try {
          // Validate that we have content before saving
          if (!session.formattedContent || !session.formattedContent.trim()) {
            console.warn(`Session ${session.id} has empty formattedContent, not saving to Supabase`);
            return;
          }

          // Use type assertion since the types file may not be updated yet
          const { error } = await supabase
            .from('search_sessions' as any)
            .upsert({
              id: session.id,
              user_id: user.id,
              query: session.query,
              results: session.results,
              formatted_content: session.formattedContent,
              related_queries: session.relatedQueries || [],
              source_conversations: session.sourceConversations || {},
              summary_conversation: session.summaryConversation || [],
              updated_at: new Date().toISOString(),
            } as any, { onConflict: 'id' });

          if (error) {
            console.error('Error saving session to Supabase:', error);
          } else {
            console.log(`✅ Saved session ${session.id} to Supabase with ${session.formattedContent.length} chars of content`);
          }
        } catch (error) {
          console.error('Error saving session to Supabase:', error);
        }
      },

      deleteSessionFromSupabase: async (sessionId: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        try {
          const { error } = await supabase
            .from('search_sessions' as any)
            .delete()
            .eq('id', sessionId)
            .eq('user_id', user.id);

          if (error) {
            console.error('Error deleting session from Supabase:', error);
          }
        } catch (error) {
          console.error('Error deleting session from Supabase:', error);
        }
      },

      saveLinkToSupabase: async (link: SavedLink, listName: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        try {
          const { error } = await supabase
            .from('saved_links' as any)
            .upsert({
              id: link.id,
              user_id: user.id,
              list_id: link.listId,
              list_name: listName,
              title: link.title,
              url: link.url,
              snippet: link.snippet,
              saved_at: new Date(link.savedAt).toISOString(),
            } as any, { onConflict: 'id' });

          if (error) {
            console.error('Error saving link to Supabase:', error);
          }
        } catch (error) {
          console.error('Error saving link to Supabase:', error);
        }
      },

      deleteLinkFromSupabase: async (linkId: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        try {
          const { error } = await supabase
            .from('saved_links' as any)
            .delete()
            .eq('id', linkId)
            .eq('user_id', user.id);

          if (error) {
            console.error('Error deleting link from Supabase:', error);
          }
        } catch (error) {
          console.error('Error deleting link from Supabase:', error);
        }
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
