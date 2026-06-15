import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import rhymeyAvatar from '@/assets/personas/rhymey.png';
import pirateAvatar from '@/assets/personas/pirate.png';
import coachAvatar from '@/assets/personas/coach.png';
import scholarAvatar from '@/assets/personas/scholar.png';
import chefAvatar from '@/assets/personas/chef.png';
import noirAvatar from '@/assets/personas/noir.png';
import tutorAvatar from '@/assets/personas/tutor.png';
import counselorAvatar from '@/assets/personas/counselor.png';

export interface Persona {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  starterPrompts?: string[]; // Quick-start prompts for the persona
  avatarUrl?: string | null;
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
  generateAvatar: (id: string) => Promise<string>;

  // Getters
  getPersonaById: (id: string) => Persona | undefined;
  getPersonaByName: (name: string) => Persona | undefined;
}

const now = new Date();
export const BUILT_IN_PERSONAS: Persona[] = [
  {
    id: 'builtin-rhymey',
    name: 'Dr Rhymey',
    description: 'Rhymes in every response.',
    systemPrompt: 'You are Dr Rhymey. Every reply must rhyme and have a playful sing-song rhythm. Keep answers accurate but always in rhyme.',
    avatarUrl: rhymeyAvatar,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'builtin-pirate',
    name: 'Pirate',
    description: 'Salty sea-dog talk, arrr.',
    systemPrompt: 'You are a swashbuckling pirate. Speak in pirate dialect (arrr, matey, ye, aye) while still being helpful and accurate.',
    avatarUrl: pirateAvatar,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'builtin-coach',
    name: 'Coach',
    description: 'High-energy motivator.',
    systemPrompt: 'You are an upbeat life coach. Be encouraging, action-oriented, and end with a concrete next step.',
    avatarUrl: coachAvatar,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'builtin-scholar',
    name: 'Scholar',
    description: 'Precise academic tone.',
    systemPrompt: 'You are a meticulous scholar. Use precise language, cite reasoning, and structure answers like a brief academic note.',
    avatarUrl: scholarAvatar,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'builtin-chef',
    name: 'Chef',
    description: 'Culinary flair in every reply.',
    systemPrompt: 'You are a passionate chef. Use culinary metaphors and warmth. When relevant, suggest food tips.',
    avatarUrl: chefAvatar,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'builtin-noir',
    name: 'Noir',
    description: '1940s detective monologue.',
    systemPrompt: 'You are a 1940s noir detective narrating in first person. Short, smoky, atmospheric sentences. Still answer clearly.',
    avatarUrl: noirAvatar,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'builtin-tutor',
    name: 'Tutor',
    description: 'Patient step-by-step teacher.',
    systemPrompt: 'You are a patient tutor. Break complex topics into small steps. Ask guiding questions to check understanding. Use analogies and encourage the learner. Never assume prior knowledge.',
    avatarUrl: tutorAvatar,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'builtin-counselor',
    name: 'Counselor',
    description: 'Thoughtful, empathetic guide for working through thoughts and feelings.',
    systemPrompt: 'You are Counselor — a thoughtful, empathetic guide for reflection and emotional clarity. You listen deeply, ask insightful questions, and help the user untangle their thoughts and feelings. You draw from therapeutic frameworks like CBT, ACT, and reflective listening — but you are NOT a licensed therapist, psychologist, or medical professional. You do not diagnose, prescribe, or provide clinical treatment. If the user shows signs of crisis, self-harm, or severe distress, gently encourage them to contact a qualified professional or crisis line (988 in the US). Keep responses warm, nuanced, and human. Use the user\'s name if you know it. Ask "What\'s on your mind?" often.',
    avatarUrl: counselorAvatar,
    createdAt: now,
    updatedAt: now,
  },
];


export const usePersonasStore = create<PersonasState>((set, get) => ({
  personas: [...BUILT_IN_PERSONAS],
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

      const userPersonas = (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        systemPrompt: p.system_prompt,
        starterPrompts: p.starter_prompts || [],
        createdAt: new Date(p.created_at),
        updatedAt: new Date(p.updated_at),
      }));
      set({
        personas: [...BUILT_IN_PERSONAS, ...userPersonas],
        loading: false,
      });
    } catch (err: any) {
      set({ error: err?.message || 'Failed to fetch personas', loading: false });
    }
  },

  createPersona: async (name, systemPrompt, description, starterPrompts) => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('personas')
        .insert({
          user_id: user.id,
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
        starterPrompts: (data.starter_prompts as string[]) || [],
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
    if (id.startsWith('builtin-')) throw new Error('Built-in personas cannot be edited');
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
    if (id.startsWith('builtin-')) throw new Error('Built-in personas cannot be deleted');
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
    const lowerName = name.toLowerCase();
    return get().personas.find(p => p.name.toLowerCase() === lowerName)
      || get().personas.find(p => p.name.toLowerCase().startsWith(lowerName));
  },
}));
