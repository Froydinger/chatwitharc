import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";

export interface MemoryItem {
  content: string;
  timestamp: Date;
}

export interface ConversationMessage {
  role: string;
  content: string;
}

/**
 * Uses AI to intelligently extract meaningful memory from a message and conversation context.
 * Returns a user-centric fact like "Jake likes soda" using the user's actual name.
 */
async function extractMemoryWithAI(
  userMessage: string,
  recentMessages: ConversationMessage[] = [],
  userName: string = "User",
  existingMemories: string = ""
): Promise<string | null> {
  if (!supabase || !isSupabaseConfigured) {
    console.log('Supabase not configured, memory extraction unavailable');
    return null;
  }

  try {
    // Include existing memories in prompt so AI knows what's already saved
    const existingMemoryContext = existingMemories 
      ? `\n\nALREADY SAVED MEMORIES (do NOT duplicate these - if the user is repeating known info, return NONE):\n${existingMemories}`
      : '';

    const systemPrompt = `You are a memory extraction assistant. Your ONLY job is to extract NEW personal facts about the user that should be remembered.

The user's name is: ${userName}
${existingMemoryContext}

When the user shares NEW personal information or preferences that are NOT already saved, extract it as a clear, third-person factual statement about them.

Examples:
- User says: "I really like soda!" → Extract: "${userName} likes soda"
- User says: "For future reference, for UI stuff, I like Black glass, elasticy animations, and neon blue accent colors!" → Extract: "${userName} prefers black glass UI, elastic animations, and neon blue accent colors"
- User says: "I'm non-binary, remember that!" → Extract: "${userName} is non-binary"
- User says: "My favorite color is blue" → Extract: "${userName}'s favorite color is blue"
- User says: "I work at Google as a software engineer" → Extract: "${userName} works at Google as a software engineer"
- User says: "I'm allergic to peanuts!" → Extract: "${userName} is allergic to peanuts"
- User says: "I prefer they/them pronouns" → Extract: "${userName} uses they/them pronouns"
- User says: "I'm working on a music app" → Extract: "${userName} is working on a music app"

CRITICAL RULES:
1. ALWAYS use "${userName}" at the start of the extracted fact (not "User" or "The user")
2. Extract the MEANINGFUL personal information, not the AI's response or confirmation
3. Make it a clear, factual third-person statement about ${userName}
4. Keep it concise (under 150 characters)
5. If the info is ALREADY in the saved memories above, return "NONE" - do NOT duplicate!
6. If there's no NEW personal fact to remember (just questions or requests), return "NONE"
7. ONLY return the extracted fact - no explanations, no quotes, no extra text
8. Look at what the USER said, not what the assistant said
9. If the user is using a prompt that includes their own info (like personalized prompts), that's NOT a new memory - return "NONE"

What NEW personal fact should be remembered from this conversation?`;

    // Build conversation context - include recent messages for context
    const contextMessages = recentMessages.slice(-6).map(m => ({
      role: m.role,
      content: m.content
    }));

    const messages = [
      { role: 'system', content: systemPrompt },
      ...contextMessages,
      { role: 'user', content: `The user just said: "${userMessage}"\n\nExtract the NEW personal fact to remember about ${userName}, or return NONE if there isn't one or if it's already saved.` }
    ];

    // Call the chat API
    const { data, error } = await supabase.functions.invoke('chat', {
      body: {
        messages,
        model: 'google/gemini-2.5-flash-lite'
      }
    });

    if (error) {
      console.error('AI memory extraction error:', error);
      return null;
    }

    // The chat API returns { choices: [{ message: { content: "..." } }] }
    const extractedContent = data?.choices?.[0]?.message?.content?.trim();

    // If AI couldn't find a personal fact, return null
    if (!extractedContent ||
        extractedContent === 'NONE' ||
        extractedContent === 'UNCLEAR' ||
        extractedContent.length < 5 ||
        extractedContent.toLowerCase().includes('no personal fact') ||
        extractedContent.toLowerCase().includes('no fact to remember')) {
      return null;
    }

    // Clean up the response - remove quotes if present
    let cleaned = extractedContent;
    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
        (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
      cleaned = cleaned.slice(1, -1);
    }

    // CRITICAL: Validate the response is actually a personal fact about the user
    // The AI sometimes responds with support/advice instead of extracting a fact
    const lowerCleaned = cleaned.toLowerCase();

    // Must start with the user's name (the expected format)
    const startsWithUserName = cleaned.toLowerCase().startsWith(userName.toLowerCase());

    // Reject responses that look like advice/support rather than facts
    const isAdviceOrSupport =
      lowerCleaned.includes('please reach out') ||
      lowerCleaned.includes('please contact') ||
      lowerCleaned.includes('please call') ||
      lowerCleaned.includes('please seek') ||
      lowerCleaned.includes('you can call') ||
      lowerCleaned.includes('you can text') ||
      lowerCleaned.includes('crisis') ||
      lowerCleaned.includes('hotline') ||
      lowerCleaned.includes('help is available') ||
      lowerCleaned.includes('you are not alone') ||
      lowerCleaned.includes("you're not alone") ||
      lowerCleaned.includes('i encourage you') ||
      lowerCleaned.includes('i recommend') ||
      lowerCleaned.includes('i suggest') ||
      lowerCleaned.includes('consider reaching') ||
      lowerCleaned.startsWith('if you') ||
      lowerCleaned.startsWith('please ');

    if (!startsWithUserName || isAdviceOrSupport) {
      console.log('AI response rejected - not a valid personal fact format:', cleaned);
      return null;
    }

    console.log('AI extracted memory:', cleaned);
    return cleaned;
  } catch (error) {
    console.error('Error in AI memory extraction:', error);
    return null;
  }
}

// Sanitize memory text to natural language
export function sanitizeMemoryText(text: string): string {
  let t = text.trim();
  // strip surrounding quotes or backticks
  if ((t.startsWith("\"") && t.endsWith("\"")) || (t.startsWith("'") && t.endsWith("'")) || (t.startsWith('`') && t.endsWith('`'))) {
    t = t.slice(1, -1);
  }
  // collapse multiple spaces
  t = t.replace(/\s{2,}/g, ' ').trim();
  // ensure it reads as a sentence when possible
  if (!/[.!?]$/.test(t) && t.split(' ').length > 2) {
    t = t + '.';
  }
  return t;
}

/**
 * Detects if a message might contain personal information worth remembering.
 * More dynamic detection - looks for personal statements, preferences, facts about the user.
 */
export async function detectMemoryCommand(
  message: string,
  recentMessages: ConversationMessage[] = [],
  userName: string = "User"
): Promise<MemoryItem | null> {
  const lowerMessage = message.toLowerCase().trim();

  // Check for explicit memory negations first
  if (lowerMessage.includes('forget') ||
      lowerMessage.includes('delete') ||
      lowerMessage.includes('remove from memory')) {
    return null;
  }

  // Patterns that indicate personal information or preference sharing
  const hasMemoryKeyword = /(?:remember|rem|memorize|save|note|keep track of|don't forget|make note of|keep|store|record|add to memory|to memory|jot down)/i.test(message);
  
  // Also detect personal statements even without explicit memory keywords
  // More comprehensive pattern to catch emphatic statements like "i REALLY love X"
  const hasPersonalStatement = /(?:^i\s|^i'm|^i am|^my\s|i\s+(?:really\s+)?like|i\s+(?:really\s+)?love|i\s+(?:really\s+)?prefer|i\s+(?:really\s+)?hate|i\s+(?:really\s+)?enjoy|i work|i live|i have|for future reference|going forward|keep in mind|fyi|just so you know|it's my (?:favorite|fav|favourite)|my favorite|my fav|my favourite|is my favorite|is my fav)/i.test(message);

  // If neither pattern matches, no memory to extract
  if (!hasMemoryKeyword && !hasPersonalStatement) {
    return null;
  }

  // Fetch existing memories to check for duplicates before AI extraction
  let existingMemories = "";
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('memory_info')
        .eq('user_id', user.id)
        .maybeSingle();
      existingMemories = profile?.memory_info || "";
    }
  } catch (err) {
    console.error('Error fetching existing memories:', err);
  }

  // Use AI to extract the meaningful memory with the user's name AND existing memories context
  console.log('Potential memory detected, using AI to extract meaningful content...');
  const extractedContent = await extractMemoryWithAI(message, recentMessages, userName, existingMemories);

  if (!extractedContent) {
    console.log('AI did not find a NEW personal fact to remember');
    return null;
  }

  return {
    content: sanitizeMemoryText(extractedContent),
    timestamp: new Date()
  };
}

/**
 * Adds a memory item to the user's memory bank in their profile.
 * Returns true if a new memory was saved, false if it already existed.
 */
export async function addToMemoryBank(memoryItem: MemoryItem): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured) {
    console.log('Supabase not configured, memory bank unavailable');
    return false;
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    // Fetch current profile to get existing memory
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('memory_info')
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError) throw fetchError;

    const existingMemory = profile?.memory_info || '';
    const sanitized = sanitizeMemoryText(memoryItem.content);

    // Build a normalized set of existing entries to avoid duplicates
    const existingLines = existingMemory
      .split('\n')
      .map(l => l.replace(/^\[[^\]]+\]\s*/, '').trim().toLowerCase())
      .filter(Boolean);

    // Robust duplicate detection - check for semantic similarity
    const normalizedNew = sanitized.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const isDuplicate = existingLines.some(existing => {
      const normalizedExisting = existing.replace(/[^\w\s]/g, '').trim();
      // Check for exact match
      if (normalizedExisting === normalizedNew) return true;
      
      // Check for substantial word overlap (70% threshold for flexibility)
      const newWords = new Set(normalizedNew.split(/\s+/).filter(w => w.length > 2));
      const existingWords = new Set(normalizedExisting.split(/\s+/).filter(w => w.length > 2));
      const intersection = new Set([...newWords].filter(x => existingWords.has(x)));
      const similarity = intersection.size / Math.max(newWords.size, existingWords.size);
      
      return similarity > 0.7;
    });

    if (isDuplicate) {
      console.log('Memory already exists, skipping duplicate');
      return false;
    }

    const memoryEntry = `[${memoryItem.timestamp.toLocaleDateString()}] ${sanitized}`;

    // Append new memory to existing memory
    const updatedMemory = existingMemory
      ? `${existingMemory}\n${memoryEntry}`
      : memoryEntry;

    // Use upsert to handle case where profile might not exist yet
    // (can happen with OAuth users if trigger failed)
    const { error: updateError } = await supabase
      .from('profiles')
      .upsert({
        user_id: user.id,
        memory_info: updatedMemory
      }, {
        onConflict: 'user_id'
      });

    if (updateError) throw updateError;

    console.log('Memory added successfully:', sanitized);
    return true;
  } catch (error) {
    console.error('Error adding to memory bank:', error);
    throw error;
  }
}

/**
 * Formats memory content for display in chat responses
 */
export function formatMemoryConfirmation(content: string): string {
  const cleaned = sanitizeMemoryText(content);
  return `I'll remember: "${cleaned}"`;
}
