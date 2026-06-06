import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export interface Persona {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  starterPrompts?: string[]; // Quick-start prompts for the persona
  createdAt: Date;
  updatedAt: Date;
}

interface PersonasState {
  personas: Persona[];
  loading: boolean;
  error: string | null;

  // CRUD
  fetchPersonas: () => Promise<void>;
  createPersona: (name: string, systemPrompt: string, description?: string, starterPrompts?: string[]) => Promise<string>;
  updatePersona: (id: string, updates: Partial<Persona>) => Promise<void>;
  deletePersona: (id: string) => Promise<void>;

  // Getters
  getPersonaById: (id: string) => Persona | undefined;
  getPersonaByName: (name: string) => Persona | undefined;
}

export const usePersonasStore = create<PersonasState>((set, get) => ({
  personas: [],
  loading: false,
  error: null,

  fetchPersonas: async () => {
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('personas')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      set({
        personas: (data || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          systemPrompt: p.system_prompt,
          starterPrompts: p.starter_prompts || [],
          createdAt: new Date(p.created_at),
          updatedAt: new Date(p.updated_at),
        })),
        loading: false,
      });
    } catch (err: any) {
      set({ error: err?.message || 'Failed to fetch personas', loading: false });
    }
  },

  createPersona: async (name, systemPrompt, description, starterPrompts) => {
    try {
      const { data, error } = await supabase
        .from('personas')
        .insert({
          name,
          system_prompt: systemPrompt,
          description,
          starter_prompts: starterPrompts || [],
        })
        .select()
        .single();

      if (error) throw error;

      const newPersona: Persona = {
        id: data.id,
        name: data.name,
        description: data.description,
        systemPrompt: data.system_prompt,
        starterPrompts: data.starter_prompts || [],
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
      };

      set(state => ({
        personas: [newPersona, ...state.personas],
      }));

      return data.id;
    } catch (err: any) {
      set({ error: err?.message || 'Failed to create persona' });
      throw err;
    }
  },

  updatePersona: async (id, updates) => {
    try {
      const updateData: any = {};
      if (updates.name) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.systemPrompt) updateData.system_prompt = updates.systemPrompt;
      if (updates.starterPrompts) updateData.starter_prompts = updates.starterPrompts;

      const { error } = await supabase
        .from('personas')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      set(state => ({
        personas: state.personas.map(p =>
          p.id === id
            ? {
                ...p,
                ...updates,
                updatedAt: new Date(),
              }
            : p,
        ),
      }));
    } catch (err: any) {
      set({ error: err?.message || 'Failed to update persona' });
      throw err;
    }
  },

  deletePersona: async (id) => {
    try {
      const { error } = await supabase
        .from('personas')
        .delete()
        .eq('id', id);

      if (error) throw error;

      set(state => ({
        personas: state.personas.filter(p => p.id !== id),
      }));
    } catch (err: any) {
      set({ error: err?.message || 'Failed to delete persona' });
      throw err;
    }
  },

  getPersonaById: (id) => {
    return get().personas.find(p => p.id === id);
  },

  getPersonaByName: (name) => {
    return get().personas.find(p => p.name.toLowerCase() === name.toLowerCase());
  },
}));
