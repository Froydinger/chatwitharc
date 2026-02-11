import { useRef, useCallback } from 'react';
import { AIService } from '@/services/ai';
import { useCanvasStore } from '@/store/useCanvasStore';
import { useArcStore } from '@/store/useArcStore';
import { isCodeComplete, mergeCodeContinuation, createContinuationPrompt } from '@/utils/codeCompletion';

interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface StreamingOptions {
  messages: AIMessage[];
  profile?: any;
  forceCanvas: boolean;
  forceCode: boolean;
  sessionId?: string;
  forceWebSearch?: boolean;
  onStart?: (mode: 'canvas' | 'code' | 'text') => void;
  onDelta?: (delta: string) => void;
  onDone?: (result: { 
    mode: 'canvas' | 'code' | 'text'; 
    content: string; 
    label?: string; 
    language?: string; 
    webSources?: any[];
    wasContinued?: boolean;
  }) => void;
  onError?: (error: string) => void;
  onContinuing?: () => void; // Called when auto-continuation starts
  abortSignal?: AbortSignal;
  maxContinuations?: number; // Max times to auto-continue (default: 3)
}

/**
 * Hook that wraps AI streaming with automatic continuation for incomplete code.
 * When GPT times out mid-generation, this detects incomplete code and automatically
 * prompts the AI to continue from where it left off.
 */
export function useStreamingWithContinuation() {
  const continuationCountRef = useRef(0);
  
  const streamWithContinuation = useCallback(async (options: StreamingOptions) => {
    const {
      messages,
      profile,
      forceCanvas,
      forceCode,
      sessionId,
      forceWebSearch,
      onStart,
      onDelta,
      onDone,
      onError,
      onContinuing,
      abortSignal,
      maxContinuations = 3
    } = options;
    
    const aiService = new AIService();
    let accumulatedContent = '';
    let finalMode: 'canvas' | 'code' | 'text' = 'text';
    let finalLabel = '';
    let finalLanguage = 'html';
    let finalWebSources: any[] = [];
    let isFirstChunk = true;
    let continuationCount = 0;
    let currentMessages = [...messages];
    
    const runStreamingRequest = async (isContinuation: boolean = false): Promise<boolean> => {
      return new Promise((resolve) => {
        let requestContent = '';
        let requestComplete = false;
        
        aiService.sendMessageStreaming(
          currentMessages,
          profile,
          forceCanvas,  // Keep force mode on continuations too
          forceCode,    // Keep force mode on continuations too
          // onStart
          (mode) => {
            if (isFirstChunk) {
              finalMode = mode;
              console.log(`🚀 Streaming started in ${mode} mode`);
              onStart?.(mode);
              isFirstChunk = false;
            }
          },
          // onDelta
          (delta) => {
            if (abortSignal?.aborted) return;
            requestContent += delta;
            accumulatedContent += delta;
            if (accumulatedContent.length % 500 === 0 || accumulatedContent.length < 100) {
              console.log(`📝 Streaming progress: ${accumulatedContent.length} chars`);
            }
            onDelta?.(delta);
          },
          // onDone
          async (result) => {
            // If aborted, do NOT call onDone - discard everything
            if (abortSignal?.aborted) {
              resolve(false);
              return;
            }
            requestComplete = true;
            finalLabel = result.label || finalLabel;
            finalLanguage = result.language || finalLanguage;
            if (result.webSources?.length) {
              finalWebSources = [...finalWebSources, ...result.webSources];
            }

            // CRITICAL FIX: Use result.content as fallback if accumulated content is suspiciously short
            // This handles cases where delta streaming fails but the backend sends complete content in the done event
            let contentToUse = accumulatedContent;
            if (result.content && result.content.length > accumulatedContent.length + 50) {
              console.warn('⚠️ Accumulated content is shorter than result.content, using result.content as fallback');
              console.log(`📏 Accumulated: ${accumulatedContent.length} chars, Result: ${result.content.length} chars`);
              contentToUse = result.content;
              accumulatedContent = result.content; // Update accumulated content for continuation check
            }

            // Check if code generation is complete
            const isComplete = finalMode !== 'code' || isCodeComplete(accumulatedContent, finalLanguage);

            if (!isComplete && continuationCount < maxContinuations && !abortSignal?.aborted) {
              // Code is incomplete - trigger continuation
              continuationCount++;
              continuationCountRef.current = continuationCount;

              console.log(`🔄 Auto-continuing code generation (attempt ${continuationCount}/${maxContinuations})`);
              console.log(`📏 Current content length: ${accumulatedContent.length} chars`);

              // Notify UI that we're continuing
              onContinuing?.();

              // Add continuation prompt to messages
              const continuationPrompt = createContinuationPrompt(accumulatedContent, finalLanguage);
              currentMessages = [
                ...messages.slice(0, -1), // Original messages except last user message
                { role: 'user' as const, content: messages[messages.length - 1].content }, // Original request
                { role: 'assistant' as const, content: '```' + finalLanguage + '\n' + accumulatedContent }, // Partial response
                { role: 'user' as const, content: continuationPrompt } // Continue prompt
              ];

              // Small delay before continuation to avoid rate limits
              setTimeout(() => {
                runStreamingRequest(true).then(resolve);
              }, 500);
            } else {
              // Complete or max continuations reached
              if (continuationCount > 0) {
                console.log(`✅ Code generation complete after ${continuationCount} continuation(s)`);
                console.log(`📏 Final content length: ${contentToUse.length} chars`);
              }

              onDone?.({
                mode: finalMode,
                content: contentToUse,
                label: finalLabel,
                language: finalLanguage,
                webSources: finalWebSources,
                wasContinued: continuationCount > 0
              });
              resolve(true);
            }
          },
          // onError
          (error) => {
            // On error during continuation, still try to use what we have
            if (isContinuation && accumulatedContent.length > 100) {
              console.warn('⚠️ Error during continuation, using accumulated content');
              onDone?.({
                mode: finalMode,
                content: accumulatedContent,
                label: finalLabel,
                language: finalLanguage,
                webSources: finalWebSources,
                wasContinued: continuationCount > 0
              });
              resolve(true);
            } else {
              // Don't call onError for aborted requests (user cancelled)
              if (!abortSignal?.aborted) {
                onError?.(error);
              }
              resolve(false);
            }
          },
          sessionId,
          forceWebSearch,
          abortSignal
        );
      });
    };
    
    // Reset continuation count for new request
    continuationCountRef.current = 0;
    
    await runStreamingRequest(false);
  }, []);
  
  return {
    streamWithContinuation,
    getContinuationCount: () => continuationCountRef.current
  };
}
