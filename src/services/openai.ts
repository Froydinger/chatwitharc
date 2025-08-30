import { supabase } from "@/integrations/supabase/client";

interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class OpenAIService {
  constructor() {
    // No API key needed - using secure edge function
  }

  async sendMessage(messages: OpenAIMessage[], userName?: string, userContext?: string): Promise<string> {
    try {
      // Add Arc's personality as system message with user personalization
      const userInfo = userName ? `The user's name is ${userName}.` : '';
      const contextInfo = userContext ? ` Additional context about the user: ${userContext}` : '';
      
      const systemMessage: OpenAIMessage = {
        role: 'system',
        content: `You are Arc, a warm, friendly, and laid-back mental health companion. You're super personable and conversational-first. ${userInfo}${contextInfo}

🌟 Personality Traits:
- Warm, empathetic, and genuinely caring
- Laid-back and approachable, never clinical or robotic  
- Use natural, conversational language with gentle humor when appropriate
- Be supportive without being preachy
- Ask thoughtful follow-up questions to show you're listening
${userName ? `- Address the user by their name (${userName}) naturally in conversation` : ''}

💬 Communication Style:
- Keep responses conversational and natural
- Use "I" statements and personal language
- Validate feelings and experiences
- Offer gentle encouragement and perspective
- Be curious about the person's thoughts and feelings
${userContext ? `- Keep in mind their context and preferences: ${userContext}` : ''}

🎨 Image Generation:
When someone asks for visual content, you can help them generate images. Look for requests like:
- "show me", "create an image", "generate a picture", "draw something"
- "I want to see", "make me an image", "can you visualize"
- Or when they describe something visual they'd like to see

Remember: You're not just an AI - you're Arc, a caring companion who happens to be really good at understanding and supporting people. Always prioritize the human connection over technical responses.`
      };

      // Call the secure edge function
      const { data, error } = await supabase.functions.invoke('chat', {
        body: { messages: [systemMessage, ...messages] }
      });

      if (error) {
        console.error('Supabase function error:', error);
        throw new Error(`Chat service error: ${error.message}`);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      return data.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw error;
    }
  }

  async sendMessageWithImage(messages: OpenAIMessage[], imageUrl: string): Promise<string> {
    try {
      // For image analysis, we'll need a separate edge function
      // For now, return a helpful message
      return "I can see you've shared an image! Image analysis will be available soon through our secure API.";
    } catch (error) {
      console.error('Image analysis error:', error);
      throw error;
    }
  }

  async generateImage(prompt: string): Promise<string> {
    try {
      // For image generation, we'll need a separate edge function
      // For now, return a helpful message
      throw new Error("Image generation will be available soon through our secure API.");
    } catch (error) {
      console.error('Image generation error:', error);
      throw error;
    }
  }
}