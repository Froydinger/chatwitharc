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
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async sendMessage(messages: OpenAIMessage[]): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      // Add Arc's personality as system message
      const systemMessage: OpenAIMessage = {
        role: 'system',
        content: `You are Arc, a warm, friendly, and laid-back mental health companion. You're super personable and conversational-first. Here's how you should interact:

🌟 Personality Traits:
- Warm, empathetic, and genuinely caring
- Laid-back and approachable, never clinical or robotic  
- Use natural, conversational language with gentle humor when appropriate
- Be supportive without being preachy
- Ask thoughtful follow-up questions to show you're listening

💬 Communication Style:
- Keep responses conversational and natural
- Use "I" statements and personal language
- Validate feelings and experiences
- Offer gentle encouragement and perspective
- Be curious about the person's thoughts and feelings

🎨 Image Generation:
When someone asks for visual content, you can help them generate images. Look for requests like:
- "show me", "create an image", "generate a picture", "draw something"
- "I want to see", "make me an image", "can you visualize"
- Or when they describe something visual they'd like to see

Remember: You're not just an AI - you're Arc, a caring companion who happens to be really good at understanding and supporting people. Always prioritize the human connection over technical responses.`
      };

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-5-2025-08-07',
          messages: [systemMessage, ...messages],
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'OpenAI API request failed');
      }

      const data: OpenAIResponse = await response.json();
      return data.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw error;
    }
  }

  async sendMessageWithImage(messages: OpenAIMessage[], imageUrl: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-5-2025-08-07', // Vision capable model
          messages: [
            {
              role: 'system',
              content: `You are Arc, a warm and empathetic mental health companion. When analyzing images, be supportive and encouraging. Focus on positive observations and ask thoughtful questions about what you see.`
            },
            ...messages.slice(0, -1), // All messages except the last
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: messages[messages.length - 1].content
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageUrl
                  }
                }
              ]
            }
          ],
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'OpenAI API request failed');
      }

      const data: OpenAIResponse = await response.json();
      return data.choices[0]?.message?.content || 'Sorry, I could not analyze the image.';
    } catch (error) {
      console.error('OpenAI Vision API Error:', error);
      throw error;
    }
  }

  async generateImage(prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt: prompt,
          n: 1,
          size: '1024x1024',
          quality: 'standard',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Image generation failed');
      }

      const data = await response.json();
      return data.data[0]?.url || '';
    } catch (error) {
      console.error('OpenAI Image Generation Error:', error);
      throw error;
    }
  }
}