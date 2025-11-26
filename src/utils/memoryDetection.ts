import { supabase } from "@/integrations/supabase/client";

export interface MemoryItem {
  content: string;
  timestamp: Date;
}

export interface ConversationMessage {
  role: string;
  content: string;
}

/**
 * Uses AI to intelligently extract meaningful memory from a message and conversation context
 * This is much smarter than regex - it understands what the user actually wants to remember
 */
async function extractMemoryWithAI(
  userMessage: string,
  recentMessages: ConversationMessage[] = []
): Promise<string | null> {
  try {
    const systemPrompt = `You are a memory extraction assistant. Your ONLY job is to identify what meaningful information the user wants you to remember.

When the user says something like "remember that" or uses memory keywords, you need to figure out what "that" refers to by looking at the context of their message and recent conversation.

Examples:
- "I have NEVER told you I was non-binary lol. whoops. Remember that!" → Extract: "User is non-binary"
- "My favorite color is blue. Remember this!" → Extract: "User's favorite color is blue"
- "I work at Google as a software engineer. Keep track of that." → Extract: "User works at Google as a software engineer"
- "Don't forget I'm allergic to peanuts!" → Extract: "User is allergic to peanuts"
- "Note: I prefer they/them pronouns" → Extract: "User prefers they/them pronouns"

CRITICAL RULES:
1. Extract the MEANINGFUL information, not just what comes after the keyword
2. Make it a clear, factual statement about the user
3. Keep it concise (under 200 characters)
4. If you can't determine what to remember, return "UNCLEAR"
5. ONLY return the extracted fact - no explanations, no extra text

What should be remembered from this message?`;

    // Build conversation context
    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentMessages.slice(-5), // Include last 5 messages for context
      { role: 'user', content: userMessage }
    ];

    // Call the chat API
    const { data, error } = await supabase.functions.invoke('chat', {
      body: {
        messages,
        model: 'google/gemini-2.5-flash' // Use fast model for quick extraction
      }
    });

    if (error) {
      console.error('AI memory extraction error:', error);
      return null;
    }

    // The chat API returns { choices: [{ message: { content: "..." } }] }
    const extractedContent = data?.choices?.[0]?.message?.content?.trim();

    // If AI couldn't figure it out, return null
    if (!extractedContent || extractedContent === 'UNCLEAR' || extractedContent.length < 3) {
      return null;
    }

    return extractedContent;
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
  // replace underscores/hyphens with spaces
  t = t.replace(/[\-_]+/g, ' ');
  // collapse multiple spaces
  t = t.replace(/\s{2,}/g, ' ').trim();
  // ensure it reads as a sentence when possible
  if (!/[.!?]$/.test(t) && t.split(' ').length > 3) {
    t = t + '.';
  }
  // No length limit - preserve full context for memories
  return t;
}

/**
 * Detects if a message contains a "remember this" command and extracts the content
 * Now uses AI to intelligently understand what should be remembered!
 */
export async function detectMemoryCommand(
  message: string,
  recentMessages: ConversationMessage[] = []
): Promise<MemoryItem | null> {
  const lowerMessage = message.toLowerCase().trim();

  // Common patterns for "remember this" commands - just check if a keyword exists
  const hasMemoryKeyword = /(?:remember|rem|memorize|save|note|keep track of|don't forget|make note of|keep|store|record|add to memory|to memory|jot down)/i.test(message);

  // Also check for explicit memory negations
  if (lowerMessage.includes('forget') ||
      lowerMessage.includes('delete') ||
      lowerMessage.includes('remove from memory')) {
    return null;
  }

  if (!hasMemoryKeyword) {
    return null;
  }

  // Use AI to extract the meaningful memory
  console.log('Memory keyword detected, using AI to extract meaningful content...');
  const extractedContent = await extractMemoryWithAI(message, recentMessages);

  if (!extractedContent) {
    console.log('AI could not extract meaningful memory from message');
    return null;
  }

  console.log('AI extracted memory:', extractedContent);

  return {
    content: sanitizeMemoryText(extractedContent),
    timestamp: new Date()
  };
}

/**
 * Adds a memory item to the user's memory bank in their profile
 * Returns true if a new memory was saved, false if it already existed
 */
export async function addToMemoryBank(memoryItem: MemoryItem): Promise<boolean> {
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

    // Build a normalized set of existing entries (without date prefixes) to avoid duplicates
    const existingLines = existingMemory
      .split('\n')
      .map(l => l.replace(/^\[[^\]]+\]\s*/, '').trim().toLowerCase())
      .filter(Boolean);

    // More robust duplicate detection - check for semantic similarity
    const normalizedNew = sanitized.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const isDuplicate = existingLines.some(existing => {
      const normalizedExisting = existing.replace(/[^\w\s]/g, '').trim();
      // Check for exact match or substantial overlap (>80% similarity)
      if (normalizedExisting === normalizedNew) return true;
      
      // Check for substantial word overlap to catch paraphrases
      const newWords = new Set(normalizedNew.split(/\s+/));
      const existingWords = new Set(normalizedExisting.split(/\s+/));
      const intersection = new Set([...newWords].filter(x => existingWords.has(x)));
      const similarity = intersection.size / Math.max(newWords.size, existingWords.size);
      
      return similarity > 0.8; // 80% word overlap threshold
    });

    if (isDuplicate) {
      // Memory already exists, skipping
      return false;
    }

    const memoryEntry = `[${memoryItem.timestamp.toLocaleDateString()}] ${sanitized}`;
    
    // Append new memory to existing memory
    const updatedMemory = existingMemory 
      ? `${existingMemory}\n${memoryEntry}`
      : memoryEntry;

    // Update profile with new memory
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ memory_info: updatedMemory })
      .eq('user_id', user.id);

    if (updateError) throw updateError;

    // Memory added successfully
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