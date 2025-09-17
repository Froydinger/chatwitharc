import { supabase } from "@/integrations/supabase/client";

export interface MemoryItem {
  content: string;
  timestamp: Date;
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
  // limit to reasonable length
  if (t.length > 200) t = t.slice(0, 200).trim() + '...';
  return t;
}

/**
 * Detects if a message contains a "remember this" command and extracts the content
 */
export function detectMemoryCommand(message: string): MemoryItem | null {
  const lowerMessage = message.toLowerCase().trim();
  
  // Common patterns for "remember this" commands
  const patterns = [
    /(?:remember|rem|memorize|save|note|keep track of|don't forget|make note of)\s+(?:this|that)?\s*:?\s*(.+)/i,
    /(?:remember|memorize|save|note)\s+(.+)/i,
    /(?:keep|store|record)\s+(?:this|that)?\s*:?\s*(.+)/i,
    /(?:add to memory|to memory):\s*(.+)/i,
    /(?:note|jot down):\s*(.+)/i
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const extractedContent = match[1].trim();
      
      // Skip if the extracted content is too short or seems like a command
      if (extractedContent.length < 3) continue;
      if (extractedContent.toLowerCase().includes('nothing') || 
          extractedContent.toLowerCase().includes('forget') ||
          extractedContent.toLowerCase().includes('delete')) continue;
      
      return {
        content: sanitizeMemoryText(extractedContent),
        timestamp: new Date()
      };
    }
  }

  return null;
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

    if (existingLines.includes(sanitized.toLowerCase())) {
      console.log('Memory already exists, skipping:', sanitized);
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

    console.log('Memory added successfully:', memoryEntry);
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