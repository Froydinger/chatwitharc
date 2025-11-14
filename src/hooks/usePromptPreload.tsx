import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { generatePromptsByCategory } from '@/utils/promptGenerator';

export interface QuickPrompt {
  label: string;
  prompt: string;
}

const CACHE_KEY_PREFIX = 'arc_prompts_cache_';

// Store prompts in sessionStorage for instant access
function cachePrompts(category: string, prompts: QuickPrompt[]) {
  try {
    sessionStorage.setItem(CACHE_KEY_PREFIX + category, JSON.stringify(prompts));
  } catch (error) {
    console.error('Failed to cache prompts:', error);
  }
}

export function getCachedPrompts(category: string): QuickPrompt[] | null {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY_PREFIX + category);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error('Failed to get cached prompts:', error);
    return null;
  }
}

// Generate AI prompts for a category
async function generateAIPrompts(category: 'chat' | 'create' | 'write' | 'code'): Promise<QuickPrompt[]> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-category-prompts', {
      body: { category }
    });

    if (error) {
      console.error(`Failed to generate ${category} prompts:`, error);
      return generatePromptsByCategory(category);
    }

    const prompts = data?.prompts || generatePromptsByCategory(category);
    cachePrompts(category, prompts);
    return prompts;
  } catch (error) {
    console.error(`Error generating ${category} prompts:`, error);
    return generatePromptsByCategory(category);
  }
}

/**
 * Hook to pre-generate prompts in the background after app loads
 * This ensures prompts are ready instantly when user opens the library
 * Results are cached in sessionStorage for instant access across components
 */
export function usePromptPreload() {
  const hasPreloaded = useRef(false);

  useEffect(() => {
    // Only preload once after initial mount
    if (hasPreloaded.current) return;

    // Wait a bit to ensure app is fully loaded
    const timer = setTimeout(async () => {
      hasPreloaded.current = true;

      console.log('🔮 Pre-generating prompts in background...');

      try {
        // Generate all categories in parallel for maximum speed
        await Promise.all([
          generateAIPrompts('chat'),
          generateAIPrompts('create'),
          generateAIPrompts('write'),
          generateAIPrompts('code'),
        ]);

        console.log('✨ Prompts pre-generated and cached in sessionStorage!');
      } catch (error) {
        console.error('Failed to preload prompts:', error);
      }
    }, 2000); // Wait 2 seconds after mount to avoid slowing down initial load

    return () => clearTimeout(timer);
  }, []);
}
