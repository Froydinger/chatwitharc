// Utility functions for detecting and handling incomplete code generation

/**
 * Checks if HTML/code appears to be complete (not cut off mid-stream)
 * Returns true if the code appears complete, false if it seems truncated
 */
export function isCodeComplete(code: string, language: string = 'html'): boolean {
  if (!code || code.length < 50) return true; // Too short to analyze
  
  const trimmed = code.trim();
  
  // For HTML, check for closing tags
  if (language === 'html' || language === 'htm') {
    // Check for common signs of complete HTML
    const hasDoctype = trimmed.toLowerCase().includes('<!doctype');
    const hasHtmlClose = trimmed.includes('</html>');
    const hasBodyClose = trimmed.includes('</body>');
    
    // If it has doctype but no closing tags, it's incomplete
    if (hasDoctype && (!hasHtmlClose || !hasBodyClose)) {
      return false;
    }
    
    // Check for unclosed script/style tags
    const scriptOpens = (trimmed.match(/<script/gi) || []).length;
    const scriptCloses = (trimmed.match(/<\/script>/gi) || []).length;
    if (scriptOpens > scriptCloses) return false;
    
    const styleOpens = (trimmed.match(/<style/gi) || []).length;
    const styleCloses = (trimmed.match(/<\/style>/gi) || []).length;
    if (styleOpens > styleCloses) return false;
    
    // Check if code ends mid-tag or mid-attribute
    const lastChars = trimmed.slice(-100);
    if (lastChars.includes('="') && !lastChars.includes('"')) return false; // Unclosed attribute
    if (lastChars.match(/<[a-z][^>]*$/i)) return false; // Unclosed tag
  }
  
  // For JavaScript/TypeScript
  if (['javascript', 'js', 'typescript', 'ts', 'jsx', 'tsx'].includes(language)) {
    const openBraces = (trimmed.match(/{/g) || []).length;
    const closeBraces = (trimmed.match(/}/g) || []).length;
    if (openBraces > closeBraces + 1) return false; // Allow 1 difference for edge cases
    
    const openParens = (trimmed.match(/\(/g) || []).length;
    const closeParens = (trimmed.match(/\)/g) || []).length;
    if (openParens > closeParens + 2) return false;
  }
  
  // For CSS
  if (language === 'css') {
    const openBraces = (trimmed.match(/{/g) || []).length;
    const closeBraces = (trimmed.match(/}/g) || []).length;
    if (openBraces !== closeBraces) return false;
  }
  
  // Check for common truncation patterns
  const truncationPatterns = [
    /\/\/ ?\.\.\.$/, // // ...
    /\/\* ?\.\.\. ?\*?\/?$/, // /* ... */ or /* ...
    /\.\.\.$/,  // ends with ...
    /<!-- ?\.\.\. ?-?-?>?$/, // <!-- ... -->
    /\/\/ more code/i,
    /\/\/ continued/i,
    /\/\/ rest of/i,
    /\/\/ \.\.\./,
  ];
  
  for (const pattern of truncationPatterns) {
    if (pattern.test(trimmed)) return false;
  }
  
  return true;
}

/**
 * Extracts the last meaningful portion of code for continuation context
 * Returns a snippet that gives the AI enough context to continue
 */
export function getCodeContinuationContext(code: string, maxLength: number = 2000): string {
  if (code.length <= maxLength) return code;
  
  // Get the last portion, try to find a good break point
  const lastPortion = code.slice(-maxLength);
  
  // Try to find a good starting point (start of a line)
  const lineBreak = lastPortion.indexOf('\n');
  if (lineBreak !== -1 && lineBreak < 200) {
    return lastPortion.slice(lineBreak + 1);
  }
  
  return lastPortion;
}

/**
 * Merges a continuation with original code, handling potential overlap
 */
export function mergeCodeContinuation(original: string, continuation: string): string {
  if (!continuation) return original;
  
  // Clean up the continuation
  let cleanContinuation = continuation.trim();
  
  // Remove any leading comments that explain continuation
  cleanContinuation = cleanContinuation.replace(/^\/\/ ?(continuing|here's the rest|continuation).*\n?/gi, '');
  cleanContinuation = cleanContinuation.replace(/^<!-- ?(continuing|here's the rest|continuation).*-->\n?/gi, '');
  
  // Check for overlap - the AI might repeat some of the last lines
  const originalLines = original.split('\n');
  const continuationLines = cleanContinuation.split('\n');
  
  // Look for overlap in last few lines
  for (let overlapSize = Math.min(5, originalLines.length); overlapSize > 0; overlapSize--) {
    const originalEnd = originalLines.slice(-overlapSize).join('\n').trim();
    const continuationStart = continuationLines.slice(0, overlapSize).join('\n').trim();
    
    if (originalEnd && originalEnd === continuationStart) {
      // Found overlap, skip those lines in continuation
      cleanContinuation = continuationLines.slice(overlapSize).join('\n');
      break;
    }
  }
  
  // Ensure proper joining (avoid double newlines or missing newlines)
  const endsWithNewline = original.endsWith('\n');
  const startsWithNewline = cleanContinuation.startsWith('\n');
  
  if (endsWithNewline && startsWithNewline) {
    return original + cleanContinuation.slice(1);
  } else if (!endsWithNewline && !startsWithNewline && cleanContinuation) {
    return original + '\n' + cleanContinuation;
  }
  
  return original + cleanContinuation;
}

/**
 * Creates a continuation prompt for the AI
 */
export function createContinuationPrompt(partialCode: string, language: string = 'html'): string {
  const context = getCodeContinuationContext(partialCode);
  
  return `You were generating code but got cut off. Here's where you stopped:

\`\`\`${language}
${context}
\`\`\`

CONTINUE EXACTLY from where you left off. Do NOT restart from the beginning. Do NOT include any explanation - just output the remaining code that completes this file. Start your output immediately from where the code above ends.`;
}
