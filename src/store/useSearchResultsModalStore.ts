import { create } from 'zustand';

export interface SearchModalSource {
  title: string;
  url: string;
  snippet?: string;
}

interface SearchResultsModalState {
  isOpen: boolean;
  query: string;
  content: string;
  sources: SearchModalSource[];
  show: (payload: { query: string; content: string; sources: SearchModalSource[] }) => void;
  close: () => void;
}

export const useSearchResultsModalStore = create<SearchResultsModalState>((set) => ({
  isOpen: false,
  query: '',
  content: '',
  sources: [],
  show: ({ query, content, sources }) => set({ isOpen: true, query, content, sources }),
  close: () => set({ isOpen: false }),
}));
