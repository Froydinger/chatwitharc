import { Profile } from '@/hooks/useProfile';
import { ChatSession } from '@/store/useArcStore';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';

export interface QuickPrompt {
  label: string;
  prompt: string;
  category: 'chat' | 'create' | 'write' | 'code';
  isPersonalized?: boolean; // AI-generated personalized prompt
  fullPrompt?: string; // Full contextual prompt for personalized prompts
}

// Cache for personalized prompts
let personalizedPromptsCache: QuickPrompt[] = [];
let lastCacheTime = 0;
const CACHE_DURATION = 1000 * 60 * 30; // 30 minutes

/**
 * Fetch AI-generated personalized prompts based on user memories and context
 */
export async function fetchPersonalizedPrompts(
  profile: Profile | null,
  chatSessions: ChatSession[],
  skipCache: boolean = false
): Promise<QuickPrompt[]> {
  // Check cache first (unless explicitly skipping)
  const now = Date.now();
  if (!skipCache && personalizedPromptsCache.length > 0 && now - lastCacheTime < CACHE_DURATION) {
    return personalizedPromptsCache;
  }

  // Only generate if user has meaningful context
  const hasContext = profile?.memory_info || profile?.context_info || chatSessions.length > 0;
  if (!hasContext) {
    return [];
  }

  if (!supabase || !isSupabaseConfigured) {
    return [];
  }

  try {
    // Pass selected model for personalized prompt generation
    const selectedModel = sessionStorage.getItem('arc_session_model') || 'google/gemini-3-flash-preview';
    const { data, error } = await supabase.functions.invoke('generate-personalized-prompts', {
      body: {
        profile: profile ? {
          display_name: profile.display_name,
          memory_info: profile.memory_info,
          context_info: profile.context_info,
        } : null,
        recentChats: chatSessions.slice(0, 5).map(chat => ({
          title: chat.title,
        })),
        model: selectedModel
      },
    });

    if (error) throw error;

    const aiPrompts = (data?.prompts || []).map((p: any) => ({
      label: p.icon + ' ' + p.text,
      prompt: p.text,
      fullPrompt: p.fullPrompt || p.text,
      category: p.category as 'chat' | 'create' | 'write' | 'code',
      isPersonalized: true,
    }));

    // Update cache
    personalizedPromptsCache = aiPrompts;
    lastCacheTime = now;

    return aiPrompts;
  } catch (error) {
    console.error('Failed to fetch personalized prompts:', error);
    return [];
  }
}

/**
 * Smart prompt selection algorithm with AI personalization
 * Returns AI-personalized prompts when available, otherwise falls back to scored defaults.
 */
export async function selectSmartPrompts(
  prompts: QuickPrompt[],
  profile: Profile | null,
  chatSessions: ChatSession[],
  count: number = 3,
  skipCache: boolean = false
): Promise<QuickPrompt[]> {
  // Try to fetch personalized prompts
  const personalizedPrompts = await fetchPersonalizedPrompts(profile, chatSessions, skipCache);

  // If we have personalized prompts, use them
  if (personalizedPrompts.length > 0) {
    return personalizedPrompts.slice(0, count);
  }

  // Fall back to scored default prompts for new users with no context
  const hour = new Date().getHours();
  const scoredPrompts = prompts
    .map(prompt => ({
      prompt,
      score: scorePrompt(prompt, profile, chatSessions, hour)
    }))
    .sort((a, b) => b.score - a.score);

  // Return top scored defaults
  return scoredPrompts.slice(0, count).map(sp => sp.prompt);
}

/**
 * Score a prompt based on relevance (0-100)
 */
function scorePrompt(
  prompt: QuickPrompt,
  profile: Profile | null,
  chatSessions: ChatSession[],
  hour: number
): number {
  let score = 0;
  
  // Base category weighting (prioritize chat/reflect/create)
  if (prompt.category === 'chat') score += 30;
  else if (prompt.category === 'create') score += 25;
  else if (prompt.category === 'write') score += 20;
  else if (prompt.category === 'code') score += 10;
  
  // Memory keyword matching (+20 points)
  if (profile?.memory_info) {
    const memoryLower = profile.memory_info.toLowerCase();
    const promptLower = prompt.prompt.toLowerCase();
    
    // Extract meaningful keywords
    const memoryKeywords = memoryLower
      .split(/\W+/)
      .filter(w => w.length > 4);
    
    const matches = memoryKeywords.filter(keyword => 
      promptLower.includes(keyword)
    ).length;
    
    score += Math.min(matches * 5, 20);
  }
  
  // Context/preference matching (+15 points)
  if (profile?.context_info) {
    const contextLower = profile.context_info.toLowerCase();
    const promptLower = prompt.prompt.toLowerCase();
    
    if (contextLower.includes('creative') && prompt.category === 'create') score += 15;
    if (contextLower.includes('writer') && prompt.category === 'write') score += 15;
    if (contextLower.includes('developer') && prompt.category === 'code') score += 15;
    if (contextLower.includes('reflect') && prompt.label.toLowerCase().includes('reflect')) score += 15;
  }
  
  // Recent chat topic similarity (+15 points)
  const recentSessions = chatSessions.slice(0, 5);
  const recentMessages = recentSessions.flatMap(s => s.messages).slice(0, 20);
  
  const recentText = recentMessages
    .map(m => m.content.toLowerCase())
    .join(' ');
  
  const promptKeywords = prompt.prompt.toLowerCase().split(/\W+/).filter(w => w.length > 4);
  const topicMatches = promptKeywords.filter(keyword => 
    recentText.includes(keyword)
  ).length;
  
  score += Math.min(topicMatches * 3, 15);
  
  // Time-of-day relevance (+15 points)
  const timeScore = getTimeOfDayScore(prompt.label, hour);
  score += timeScore;
  
  // Recency penalty: Avoid recently used prompts (-10 points)
  const recentPrompts = recentMessages
    .filter(m => m.role === 'user')
    .slice(0, 5)
    .map(m => m.content.toLowerCase());
  
  const wasRecentlyUsed = recentPrompts.some(recent => 
    similar(recent, prompt.prompt.toLowerCase())
  );
  
  if (wasRecentlyUsed) score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Time-of-day relevance scoring
 */
function getTimeOfDayScore(label: string, hour: number): number {
  const lower = label.toLowerCase();
  
  // Morning (5am-12pm): Focus, Check-in
  if (hour >= 5 && hour < 12) {
    if (lower.includes('focus')) return 15;
    if (lower.includes('check-in')) return 12;
    if (lower.includes('chat')) return 8;
  }
  
  // Afternoon (12pm-6pm): Create, Code, Write
  if (hour >= 12 && hour < 18) {
    if (lower.includes('dream') || lower.includes('cosmic')) return 12;
    if (lower.includes('story') || lower.includes('blog')) return 10;
    if (lower.includes('interactive') || lower.includes('dashboard')) return 10;
    if (lower.includes('chat')) return 8;
  }
  
  // Evening (6pm-5am): Reflect, Gratitude
  if (hour >= 18 || hour < 5) {
    if (lower.includes('reflect')) return 15;
    if (lower.includes('gratitude')) return 12;
    if (lower.includes('chat')) return 10;
  }
  
  return 5; // Default
}

/**
 * Simple similarity check (case-insensitive substring match)
 */
function similar(a: string, b: string): boolean {
  const minLength = Math.min(a.length, b.length);
  if (minLength < 10) return false;
  
  // Check if they share a significant substring
  const threshold = minLength * 0.6;
  let matchLength = 0;
  
  for (let i = 0; i < a.length - 5; i++) {
    const substr = a.substring(i, i + 10);
    if (b.includes(substr)) {
      matchLength = 10;
      break;
    }
  }
  
  return matchLength >= threshold;
}
