import { Profile } from '@/hooks/useProfile';
import { ChatSession } from '@/store/useArcStore';
import { supabase } from '@/integrations/supabase/client';

export interface QuickPrompt {
  label: string;
  prompt: string;
  category: 'chat' | 'create' | 'write' | 'code';
  isPersonalized?: boolean; // AI-generated personalized prompt
}

interface PromptScore {
  prompt: QuickPrompt;
  score: number;
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
  chatSessions: ChatSession[]
): Promise<QuickPrompt[]> {
  // Check cache first
  const now = Date.now();
  if (personalizedPromptsCache.length > 0 && now - lastCacheTime < CACHE_DURATION) {
    return personalizedPromptsCache;
  }

  // Only generate if user has meaningful context
  const hasContext = profile?.memory_info || profile?.context_info || chatSessions.length > 0;
  if (!hasContext) {
    return [];
  }

  try {
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
      },
    });

    if (error) throw error;

    const aiPrompts = (data?.prompts || []).map((p: any) => ({
      label: p.icon + ' ' + p.text,
      prompt: p.text,
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
 * Prioritizes Chat/Reflect/Create prompts (70%) and mixes in personalized AI-generated prompts
 */
export async function selectSmartPrompts(
  prompts: QuickPrompt[],
  profile: Profile | null,
  chatSessions: ChatSession[],
  count: number = 3
): Promise<QuickPrompt[]> {
  // Try to fetch personalized prompts
  const personalizedPrompts = await fetchPersonalizedPrompts(profile, chatSessions);
  
  // If we have personalized prompts, mix them in
  let allPrompts = [...prompts];
  if (personalizedPrompts.length > 0) {
    // Give personalized prompts a boost in scoring
    allPrompts = [...personalizedPrompts, ...prompts];
  }
  const now = new Date();
  const hour = now.getHours();
  
  // Score all prompts (including personalized ones)
  const scoredPrompts: PromptScore[] = allPrompts.map(prompt => {
    let score = scorePrompt(prompt, profile, chatSessions, hour);
    
    // Boost personalized prompts significantly
    if (prompt.isPersonalized) {
      score += 40; // Strong boost for AI-generated prompts
    }
    
    return { prompt, score };
  });
  
  // Sort by score
  scoredPrompts.sort((a, b) => b.score - a.score);
  
  // Selection strategy: Prioritize personalized + chat/create/write (70% weighting)
  const selected: QuickPrompt[] = [];
  const categoryCount = { chat: 0, create: 0, write: 0, code: 0 };
  const personalizedCount = scoredPrompts.filter(s => s.prompt.isPersonalized).length;
  
  // Determine mix: if we have personalized prompts, show at least 1-2 of them
  const minPersonalized = personalizedCount > 0 ? Math.min(2, personalizedCount) : 0;
  let personalizedSelected = 0;
  
  // First pass: Select personalized prompts
  if (minPersonalized > 0) {
    for (const scored of scoredPrompts) {
      if (personalizedSelected >= minPersonalized) break;
      if (scored.prompt.isPersonalized) {
        selected.push(scored.prompt);
        categoryCount[scored.prompt.category]++;
        personalizedSelected++;
      }
    }
  }
  
  // Second pass: Fill remaining slots with high-scored generic prompts
  for (const scored of scoredPrompts) {
    if (selected.length >= count) break;
    if (selected.includes(scored.prompt)) continue; // Skip already selected
    
    const cat = scored.prompt.category;
    
    // Limit code prompts (max 1 out of 3 unless personalized)
    if (cat === 'code' && categoryCount.code >= 1 && !scored.prompt.isPersonalized) continue;
    
    // Ensure variety (max 2 from same category unless personalized)
    if (categoryCount[cat] >= 2 && !scored.prompt.isPersonalized) continue;
    
    selected.push(scored.prompt);
    categoryCount[cat]++;
  }
  
  return selected.slice(0, count);
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
