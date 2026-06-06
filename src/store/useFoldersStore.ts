import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";

export interface Folder {
  id: string;
  user_id: string;
  name: string;
  color?: string;
  sort_order: number;
}

interface FoldersState {
  folders: Folder[];
  loading: boolean;
  error: string | null;

  // Actions
  fetchFolders: () => Promise<void>;
  createFolder: (name: string, color?: string) => Promise<Folder | null>;
  updateFolder: (id: string, name: string, color?: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  reorderFolders: (folders: Folder[]) => Promise<void>;
}

export const useFoldersStore = create<FoldersState>((set, get) => ({
  folders: [],
  loading: false,
  error: null,

  fetchFolders: async () => {
    if (!supabase) return;
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase
        .from("chat_folders")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;
      set({ folders: data || [], loading: false });
    } catch (e: any) {
      set({ error: e?.message || "Failed to load folders", loading: false });
    }
  },

  createFolder: async (name, color) => {
    if (!supabase) return null;
    try {
      const sort_order = Math.max(0, ...get().folders.map((f) => f.sort_order)) + 1;
      const { data, error } = await supabase
        .from("chat_folders")
        .insert([{ name, color, sort_order }])
        .select()
        .single();

      if (error) throw error;
      if (data) {
        set((s) => ({ folders: [...s.folders, data] }));
        return data;
      }
    } catch (e: any) {
      set({ error: e?.message || "Failed to create folder" });
    }
    return null;
  },

  updateFolder: async (id, name, color) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from("chat_folders")
        .update({ name, color })
        .eq("id", id);

      if (error) throw error;
      set((s) => ({
        folders: s.folders.map((f) => (f.id === id ? { ...f, name, color } : f)),
      }));
    } catch (e: any) {
      set({ error: e?.message || "Failed to update folder" });
    }
  },

  deleteFolder: async (id) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.from("chat_folders").delete().eq("id", id);
      if (error) throw error;
      set((s) => ({ folders: s.folders.filter((f) => f.id !== id) }));
    } catch (e: any) {
      set({ error: e?.message || "Failed to delete folder" });
    }
  },

  reorderFolders: async (folders) => {
    if (!supabase) return;
    try {
      // Update sort_order for all folders
      const updates = folders.map((f, i) => ({
        id: f.id,
        sort_order: i,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from("chat_folders")
          .update({ sort_order: update.sort_order })
          .eq("id", update.id);
        if (error) throw error;
      }

      set({ folders });
    } catch (e: any) {
      set({ error: e?.message || "Failed to reorder folders" });
    }
  },
}));
