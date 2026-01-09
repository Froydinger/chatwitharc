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

interface SearchState {
  isOpen: boolean;
  query: string;
  results: SearchResult[];
  formattedContent: string;
  isSearching: boolean;
  lists: LinkList[];
  
  // Actions
  openSearch: (query: string, results: SearchResult[], formattedContent: string) => void;
  closeSearch: () => void;
  setSearching: (isSearching: boolean) => void;
  
  // Link list actions
  createList: (name: string) => string;
  deleteList: (listId: string) => void;
  renameList: (listId: string, newName: string) => void;
  saveLink: (link: Omit<SavedLink, 'id' | 'savedAt'>) => void;
  removeLink: (listId: string, linkId: string) => void;
  moveLink: (linkId: string, fromListId: string, toListId: string) => void;
}

export const useSearchStore = create<SearchState>()(
  persist(
    (set, get) => ({
      isOpen: false,
      query: '',
      results: [],
      formattedContent: '',
      isSearching: false,
      lists: [
        {
          id: 'default',
          name: 'Saved Links',
          createdAt: Date.now(),
          links: [],
        },
      ],

      openSearch: (query, results, formattedContent) => {
        set({
          isOpen: true,
          query,
          results,
          formattedContent,
          isSearching: false,
        });
      },

      closeSearch: () => {
        set({ isOpen: false });
      },

      setSearching: (isSearching) => {
        set({ isSearching });
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
        if (listId === 'default') return; // Can't delete default list
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
    }),
    {
      name: 'arc-search-store',
      partialize: (state) => ({
        lists: state.lists,
      }),
    }
  )
);
