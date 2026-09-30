import type { Message } from "@/store/useArcStore";


export function shouldForceVideoSearch(message: string): boolean {
  const text = message.toLowerCase();
  const asksForVideo =
    /\b(youtube|youtu\.be|video|clip|watch|play|embed)\b/.test(text) ||
    /\bshow me\b.*\b(kid|song|scene|video|clip)\b/.test(text);
  const wantsLookup =
    /\b(show me|find|look up|search|pull up|get me|link|embed|play|watch)\b/.test(text) ||
    /\bon youtube\b/.test(text);

  return asksForVideo && wantsLookup;
}


// Library prompts carry their own command prefix (image/, write/, code/), so
// the mode comes from the prompt text itself rather than the tab it sat under
// — the Create tab holds all three kinds.
export type PromptMode = 'chat' | 'image' | 'write' | 'code';


export const inferPromptMode = (prompt: string): PromptMode => {
  const m = (prompt || '').trimStart().toLowerCase();
  if (/^(?:image|draw|create)\s*\/|^\/(?:image|draw|create)\b/.test(m)) return 'image';
  if (/^(?:write|canvas)\s*\/|^\/(?:write|canvas)\b/.test(m)) return 'write';
  if (/^code\s*\/|^\/code\b/.test(m)) return 'code';
  return 'chat';
};


/* ---------------- Helpers ---------------- */
export function isImageEditRequest(message: string): boolean {
  if (!message) return false;
  const keywords = [
    "edit",
    "modify",
    "change",
    "alter",
    "update",
    "replace",
    "retouch",
    "remove",
    "add",
    "combine",
    "merge",
    "blend",
    "compose",
    "make it",
    "make this",
    "turn this",
    "convert",
    "put",
    "place",
    "swap",
    "substitute",
    "adjust",
    "tweak",
    "transform",
  ];
  const lower = message.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

// Prefix-based detection: image/, draw/, create/ OR /image, /draw, /create
export function checkForImageRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  // Support both prefix/ and /prefix syntax
  if (/^(image|draw|create)\//.test(m) || /^\/(image|draw|create)\b/.test(m)) return true;
  // Natural language detection for image generation requests
  // Supports: "generate an image of...", "draw me a cat", "make me a picture of...", "can you create an image of..."
  if (
    /^(?:(?:okay|ok|yeah|alright|cool)[,!]?\s+)?(can\s+you\s+)?(please\s+)?(generate|create|make|draw|paint|design|render|produce|visualize|show\s+me|give\s+me)\s+(me\s+)?(an?\s+)?(image|picture|pic|photo|illustration|artwork|graphic|icon|logo|wallpaper|poster|banner|thumbnail)/i.test(
      m,
    )
  )
    return true;
  // "draw me a [subject]" or "paint me a [subject]" - drawing/painting implies visual
  if (/^(can\s+you\s+)?(please\s+)?(draw|paint|sketch)\s+(me\s+)?(a|an|the|some)\s+/i.test(m)) return true;
  // Broader match: verb + optional "me" + image word anywhere in short messages
  if (
    /\b(generate|create|make|draw|paint)\s+(me\s+)?(an?\s+)?(image|picture|pic|photo|illustration)\b/i.test(m) &&
    m.length < 200
  )
    return true;
  return false;
}


/**
 * Video is Boost-only and costs ~$0.40 a clip, so detection is deliberately
 * narrower than the image equivalent — an explicit prefix or an unambiguous
 * "make a video of ..." phrasing. Vague verbs like "create" or "render" on
 * their own stay on the image path.
 */
export function checkForVideoRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  if (/^(video|animate)\//.test(m) || /^\/(video|animate)\b/.test(m)) return true;
  if (
    /^(can\s+you\s+)?(please\s+)?(generate|create|make|render|produce)\s+(me\s+)?(an?\s+)?(short\s+)?(video|clip|animation|gif)\b/i.test(m)
  )
    return true;
  if (/\b(make|create|generate|turn\s+this\s+into)\s+(it\s+|this\s+|that\s+)?(an?\s+)?(video|animation|clip)\b/i.test(m) && m.length < 200)
    return true;
  return false;
}


/** "animate this", "make this image move" — an edit-style follow-up on a still. */
export function isAnimateImageRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  if (/^(animate|\/animate|animate\/)\b/.test(m)) return true;
  return /\b(animate|bring\s+(this|it)\s+to\s+life|make\s+(this|it)\s+(move|animated)|turn\s+(this|it)\s+into\s+a\s+(video|clip|animation))\b/i.test(m);
}


/**
 * Strips the request scaffolding down to the subject. Returns "" when the
 * message was pure directive ("animate this"), so callers can fall back to a
 * sensible default instead of feeding the model the instruction verbatim.
 */
export function extractVideoPrompt(message: string): string {
  let prompt = (message || "").trim();
  prompt = prompt.replace(/^(video|animate)\/\s*/i, "").replace(/^\/(video|animate)\s*/i, "").trim();
  prompt = prompt.replace(/^(please\s+)?(?:can|could|would)\s+you\s+/i, "").trim();
  prompt = prompt
    .replace(
      /^(?:generate|create|make|render|produce)\s+(?:me\s+)?(?:an?\s+)?(?:short\s+)?(?:video|clip|animation)?\s*(?:of|showing)?\s*/i,
      "",
    )
    .trim();
  // Bare animate directives carry no subject — drop them entirely rather than
  // sending "animate this" to the model as the scene description.
  prompt = prompt
    .replace(
      /^(?:animate|bring)\s+(?:this|it|that)(?:\s+image)?(?:\s+to\s+life)?\s*/i,
      "",
    )
    .replace(/^(?:make|turn)\s+(?:this|it|that)\s+(?:move|animated|into\s+an?\s+(?:video|clip|animation))\s*/i, "")
    .trim();
  return prompt;
}


export function extractSubjectForImageRequest(message: string): string {
  const m = message.trim();
  let cleaned = m.replace(/^(can\s+you\s+)?(please\s+)?(show\s+me|find|search\s+for|look\s+up|google|generate|create|make|draw|paint|render|give\s+me)\s+/i, '');
  cleaned = cleaned.replace(/^(an?\s+)?(image|picture|pic|photo|illustration|drawing|visual|graphic|sketch|artwork|clipart|photos|images|pictures|pics)\s+(of|for|about)\s+/i, '');
  cleaned = cleaned.replace(/\b(photos|images|pictures|pics|photo|image|picture|pic)\b/i, '');
  return cleaned.trim() || "a beautiful subject";
}


export function analyzeImageRequestIntent(message: string): 'generate' | 'search' | 'ask' | 'none' {
  if (!message) return 'none';
  const m = message.trim().toLowerCase();
  
  const isImageQuery = /\b(image|picture|pic|photo|illustration|drawing|visual|graphic|sketch|artwork|clipart)s?\b/i.test(m);
  if (!isImageQuery) {
    return 'none';
  }

  const explicitGen = /\b(generate|create|make|draw|paint|render|sketch|produce|design|vector|ai\s+generate|generate\s+ai|stable\s+diffusion|dall-e|midjourney|make\s+me\s+an?)\b/i.test(m);
  const explicitSearch = /\b(search|find|look\s+up|google|tavily|web\s+search|real|actual|photo\s+of|photograph|stock\s+photo|camera|live)\b/i.test(m);

  if (explicitGen && !explicitSearch) {
    return 'generate';
  }
  if (explicitSearch && !explicitGen) {
    return 'search';
  }
  return 'ask';
}


// Prefix-based detection: code/ OR /code — opens code canvas (inline code block), not App Builder
export function checkForCodingRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  if (/^code\//.test(m) || /^\/code\b/.test(m)) return true;
  return false;
}


// Prefix-based detection: write/, /write, /canvas
export function checkForCanvasRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  // Support write/, /write, and /canvas
  if (/^write\//.test(m) || /^\/(write|canvas)\b/.test(m)) return true;
  // Natural language detection: "write me an essay", "draft a letter", "compose a poem"
  if (/^(can\s+you\s+)?(please\s+)?(write|draft|compose|author)\s+(me\s+)?(a|an|the)\s+/i.test(m)) return true;
  return false;
}


// Prefix-based detection: search/, /search
export function checkForSearchRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  // Support both search/ and /search syntax
  return /^search\//.test(m) || /^\/search\b/.test(m);
}


export function checkForGitRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  return /^git\//.test(m) || /^\/git\b/.test(m);
}


// Detect conversational messages that should NOT trigger code/canvas updates
// These are casual comments, questions, reactions - not actionable requests
export function isConversationalMessage(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();

  const actionableCanvasLanguage =
    /\b(canvas|draft|doc|document|agenda|outline|post|article|email|letter|script|copy)\b/i.test(m) &&
    /\b(i\s+(filled|updated|changed|edited|added|wrote)|filled\s+in|fill\s+(in\s+)?(the\s+)?rest|finish|complete|continue|go\s+nuts|just\s+go|use\s+what|take\s+what)\b/i.test(m);

  if (actionableCanvasLanguage) return false;

  // Short messages (under 30 chars) that are questions or reactions are usually conversational
  const isShort = m.length < 30;

  // Patterns that indicate casual conversation, not a code request
  const conversationalPatterns = [
    /^(wow|woah|whoa|cool|nice|awesome|great|amazing|neat|sweet|dope|sick|rad)/i,
    /^(thanks|thank you|thx|ty|cheers)/i,
    /^(ok|okay|k|sure|got it|understood|i see|makes sense)/i,
    /^(how did|how does|how do|how is|how come|why did|why does|why do|what is|what does|what did|where did|where does|who|when)/i,
    /^(that'?s?|this is|it'?s?) (cool|awesome|great|amazing|nice|interesting|neat|wild|crazy|insane)/i,
    /^(lol|haha|hehe|lmao|rofl|omg|wtf)/i,
    /^(yes|no|yeah|nah|yep|nope|yup)/i,
    /\?{2,}/, // Multiple question marks indicate surprise/question
    /!{2,}/, // Multiple exclamation marks indicate excitement
  ];

  // If it matches conversational patterns, it's conversational
  if (conversationalPatterns.some((p) => p.test(m))) return true;

  // Short messages ending in ? are usually questions, not requests
  if (isShort && m.endsWith("?")) return true;

  // Very short messages (under 15 chars) without action words are usually reactions
  if (m.length < 15 && !/(add|change|fix|update|make|create|build|remove|delete)/.test(m)) return true;

  return false;
}


// Smart detection for natural language code/canvas requests (without requiring / prefix)
export function looksLikeNaturalCodeRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();

  // Skip if it's conversational
  if (isConversationalMessage(m)) return false;

  // Patterns that strongly indicate code generation intent
  const codePatterns = [
    /^(build|create|make|code|develop|write)\s+(me\s+)?(a|an|the)?\s*(website|webpage|web page|app|application|landing page|dashboard|form|calculator|game|tool|component|ui|interface)/i,
    /^(can you|could you|please)?\s*(build|create|make|code|develop|write)\s+(me\s+)?(a|an|the)?\s*(website|webpage|web page|app|application|landing page|dashboard|form|calculator|game|tool|component|ui|interface)/i,
    /^(i need|i want)\s+(a|an|the)?\s*(website|webpage|web page|app|application|landing page|dashboard|form|calculator|game|tool|component|ui|interface)/i,
  ];

  return codePatterns.some((p) => p.test(m));
}


export function looksLikeNaturalCanvasRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();

  // Skip if it's conversational
  if (isConversationalMessage(m)) return false;

  // Patterns that strongly indicate writing/canvas intent
  const canvasPatterns = [
    /^(write|compose|draft|create)\s+(me\s+)?(a|an|the)?\s*(poem|essay|article|blog|story|letter|email|script|speech|song|lyrics|haiku|limerick|sonnet)/i,
    /^(can you|could you|please)?\s*(write|compose|draft|create)\s+(me\s+)?(a|an|the)?\s*(poem|essay|article|blog|story|letter|email|script|speech|song|lyrics|haiku|limerick|sonnet)/i,
    /^(i need|i want)\s+(a|an|the)?\s*(poem|essay|article|blog|story|letter|email|script|speech|song|lyrics)/i,
  ];

  return canvasPatterns.some((p) => p.test(m));
}


// Heuristic for when the Canvas is already open and the user is clearly asking
// to format/rewrite the current draft (without using write/ prefix).
export function looksLikeCanvasEditRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();

  // First check if it's clearly conversational - if so, NOT an edit request
  if (isConversationalMessage(m)) return false;

  const keywords = [
    "i filled",
    "filled in",
    "i updated",
    "updated the canvas",
    "changed the canvas",
    "edited the canvas",
    "fill in the rest",
    "fill the rest",
    "finish it",
    "complete it",
    "continue",
    "just go",
    "go nuts",
    "use what i",
    "format",
    "reformat",
    "rewrite",
    "revise",
    "edit",
    "polish",
    "improve",
    "expand",
    "shorten",
    "summarize",
    "outline",
    "draft",
    "blog",
    "essay",
    "article",
    "script",
    "email",
    "letter",
    "headers",
    "headings",
    "bold",
    "italic",
    "bullet",
    "bullets",
    "markdown",
  ];
  return keywords.some((k) => m.includes(k));
}


export function referencesCanvasSurface(message: string): boolean {
  if (!message) return false;
  return /\b(canvas|draft|doc|document|agenda|outline|piece|article|post|email|letter)\b/i.test(message);
}


// Heuristic for when the Code Canvas is open and user is asking to modify/enhance the code
export function looksLikeCodeEditRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();

  // First check if it's clearly conversational - if so, NOT an edit request
  if (isConversationalMessage(m)) return false;

  const keywords = [
    "make it",
    "add",
    "change",
    "modify",
    "update",
    "fix",
    "improve",
    "enhance",
    "include",
    "remove",
    "delete",
    "style",
    "color",
    "animation",
    "dashboard",
    "button",
    "feature",
    "function",
    "component",
    "refactor",
    "optimize",
    "can you",
    "please",
    "i want",
    "now",
    "also",
    "with",
  ];
  return keywords.some((k) => m.includes(k));
}


export function referencesCodeSurface(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  if (isConversationalMessage(m)) return false;

  return /\b(code|coded|html|css|javascript|typescript|react|component|app|website|webpage|page|ui|ux|interface|layout|visuals?|design|style|styles|styling|button|buttons|animation|responsive|mobile|desktop)\b/i.test(m);
}


// Extract the prompt after the prefix (strips prefix/ or /prefix)
export function extractPrefixPrompt(message: string): string {
  return message
    .replace(/^(image|draw|create|code|write|search|git)[/:]\s*/i, "")
    .replace(/^\/(image|draw|create|code|write|canvas|search|git)[/:\s-]\s*/i, "")
    .trim();
}




export function extractImagePrompt(message: string): string {
  let prompt = (message || "").trim();
  prompt = prompt.replace(/^(?:(?:okay|ok|yeah|alright|cool)[,!]?\s+)?/i, "").trim();
  prompt = prompt.replace(/^(please\s+)?(?:can|could|would)\s+you\s+/i, "").trim();
  prompt = prompt
    .replace(
      /^(?:generate|create|make|draw|paint|design|render|produce|visualize|show\s+me|give\s+me)\s+(?:an?\s+)?(?:image|picture|pic|photo|illustration|artwork|graphic)?\s*(?:of)?\s*/i,
      "",
    )
    .trim();
  if (!prompt) prompt = message.trim();
  if (!/^(a|an|the)\s+/i.test(prompt) && !/^[A-Z]/.test(prompt)) prompt = `a ${prompt}`;
  return prompt;
}


export function isContextualImagePrompt(message: string): boolean {
  const cleaned = extractPrefixPrompt(message).trim().toLowerCase().replace(/[.!?]+$/g, '');
  // If the prompt has substantial content (> 60 chars), it is an explicit prompt, not a pronoun reference
  if (cleaned.length > 60) return false;
  return /^(?:okay\s+|ok\s+|yeah\s+|alright\s+)?(?:go\s+for\s+it|do\s+it|make\s+it|generate\s+it|create\s+it|that|this|it)$/i.test(cleaned) ||
    /\b(?:image|picture|pic|photo|illustration)\s+(?:of\s+)?(?:that|this|it)$/i.test(cleaned) ||
    /^(?:generate|create|make|draw|render|visualize)\s+(?:an?\s+)?(?:image\s+(?:of\s+)?)?(?:that|this|it)$/i.test(cleaned);
}



export function findRecentVisualContext(messages: Message[]): string | null {
  for (let index = messages.length - 1; index >= Math.max(0, messages.length - 8); index -= 1) {
    const message = messages[index];
    if (message.imagePrompt?.trim()) return message.imagePrompt.trim();
    if (message.type !== 'text' || !message.content?.trim()) continue;

    const content = message.content.trim();
    // Prefer an explicit prompt Arc already drafted, including any negative
    // prompt that follows it. This is the common "okay, generate that" flow.
    const promptMarker = content.match(/(?:^|\n)\s*(?:\*\*)?Prompt:(?:\*\*)?\s*/i);
    if (promptMarker?.index !== undefined) {
      return content.slice(promptMarker.index + promptMarker[0].length).trim().slice(0, 5000);
    }

    // Skip tiny acknowledgements and tool/status copy; use the latest actual
    // concept description from either participant.
    if (content.length < 40) continue;
    if (/^(generating|editing|searching|i(?:'|’)ll look|let me look)/i.test(content)) continue;
    return content.slice(0, 5000);
  }
  return null;
}