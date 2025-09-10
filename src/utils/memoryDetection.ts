import { supabase } from "@/integrations/supabase/client";

export interface MemoryItem {
  content: string;
  timestamp: Date;
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
        content: extractedContent,
        timestamp: new Date()
      };
    }
  }

  return null;
}

/**
 * Adds a memory item to the user's memory bank in their profile
 */
export async function addToMemoryBank(memoryItem: MemoryItem): Promise<void> {
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
    const memoryEntry = `[${memoryItem.timestamp.toLocaleDateString()}] ${memoryItem.content}`;
    
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
  } catch (error) {
    console.error('Error adding to memory bank:', error);
    throw error;
  }
}

/**
 * Formats memory content for display in chat responses
 */
export function formatMemoryConfirmation(content: string): string {
  return `I'll remember: "${content}"`;
}