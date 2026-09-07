import { supabase } from '@/integrations/supabase/client';
import { FAVICON_OPTIONS } from '@/constants/faviconOptions';
import type { VirtualFileSystem } from '@/types/ide';

export interface GeneratedAppSeo {
  title: string;
  description: string;
  faviconLabel: string;
  subdomain: string;
}

const VALID_FAVICON_LABELS = new Set(FAVICON_OPTIONS.map(o => o.label));

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 45);
}

/** Heuristic fallback in case network or API is unavailable */
function generateFallbackSeo(prompt: string, currentTitle?: string | null): GeneratedAppSeo {
  const text = (currentTitle ? `${currentTitle} ${prompt}` : prompt).toLowerCase();
  
  let label = 'Rocket';
  if (text.includes('music') || text.includes('sound') || text.includes('audio') || text.includes('track') || text.includes('playlist') || text.includes('song')) {
    label = 'Music';
  } else if (text.includes('chat') || text.includes('message') || text.includes('social') || text.includes('discuss') || text.includes('post') || text.includes('feed')) {
    label = 'Chat';
  } else if (text.includes('shop') || text.includes('store') || text.includes('cart') || text.includes('commerce') || text.includes('buy') || text.includes('sale')) {
    label = 'Shop';
  } else if (text.includes('game') || text.includes('play') || text.includes('arcade') || text.includes('score') || text.includes('puzzle')) {
    label = 'Game';
  } else if (text.includes('code') || text.includes('developer') || text.includes('ide') || text.includes('syntax') || text.includes('script')) {
    label = 'Code';
  } else if (text.includes('note') || text.includes('task') || text.includes('todo') || text.includes('list') || text.includes('board') || text.includes('kanban')) {
    label = 'Layout';
  } else if (text.includes('ai') || text.includes('bot') || text.includes('agent') || text.includes('model') || text.includes('smart') || text.includes('intelligence')) {
    label = 'AI';
  } else if (text.includes('coffee') || text.includes('cafe') || text.includes('drink')) {
    label = 'Coffee';
  } else if (text.includes('pizza') || text.includes('food') || text.includes('recipe') || text.includes('cook') || text.includes('kitchen')) {
    label = 'Pizza';
  } else if (text.includes('draw') || text.includes('art') || text.includes('paint') || text.includes('canvas') || text.includes('color') || text.includes('palette')) {
    label = 'Palette';
  } else if (text.includes('camera') || text.includes('photo') || text.includes('image') || text.includes('gallery')) {
    label = 'Camera';
  } else if (text.includes('map') || text.includes('travel') || text.includes('location') || text.includes('trip') || text.includes('place')) {
    label = 'Map';
  } else if (text.includes('cloud') || text.includes('weather') || text.includes('sky')) {
    label = 'Cloud';
  } else if (text.includes('book') || text.includes('read') || text.includes('blog') || text.includes('journal') || text.includes('docs')) {
    label = 'Book';
  } else if (text.includes('shield') || text.includes('security') || text.includes('auth') || text.includes('protect')) {
    label = 'Shield';
  }

  const rawTitle = currentTitle || prompt.slice(0, 35).replace(/[^\w\s-]/g, '').trim() || 'Arc Web App';
  const cleanTitle = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);
  const slug = slugify(cleanTitle) || 'arc-app';
  const description = `${cleanTitle} — Interactive web application built with ArcAi.`;

  return {
    title: cleanTitle,
    description,
    faviconLabel: label,
    subdomain: slug,
  };
}

export async function generateAppSeoMetadata(params: {
  prompt?: string;
  currentTitle?: string | null;
  files?: VirtualFileSystem;
}): Promise<GeneratedAppSeo> {
  const prompt = params.prompt?.trim() || '';
  const currentTitle = params.currentTitle?.trim() || '';
  const fallback = generateFallbackSeo(prompt, currentTitle);

  // Extract snippet of App.tsx or main component if available to provide rich context
  let codeContext = '';
  if (params.files) {
    const appFile = params.files['src/App.tsx'] || params.files['src/App.jsx'] || Object.values(params.files)[0];
    if (appFile?.content) {
      codeContext = appFile.content.slice(0, 1200);
    }
  }

  const availableFaviconsList = FAVICON_OPTIONS.map(o => o.label).join(', ');

  const systemPrompt = `You are an expert app branding and SEO specialist for ArcAI web applications.
Your job is to analyze the web application's description, title, or code and generate optimal publishing metadata.

Available favicon choices (choose the SINGLE most relevant label from this exact list):
${availableFaviconsList}

Return a valid, raw JSON object with these EXACT keys:
{
  "title": "Short, catchy, polished app name (2 to 4 words, Title Case, no quotes)",
  "description": "Engaging, compelling SEO and social meta description (1 to 2 sentences, 90 to 150 characters, benefits-oriented)",
  "faviconLabel": "The single best matching label from the list above",
  "subdomain": "Clean, memorable URL slug (lowercase alphanumeric and hyphens only, 3 to 30 characters, e.g. 'sound-studio' or 'task-pulse')"
}
CRITICAL: Output ONLY the JSON object. Do not wrap in markdown fences. No explanation.`;

  const userContent = `App User Prompt: "${prompt || 'Interactive modern React web application'}"
${currentTitle ? `Current Draft Title: "${currentTitle}"` : ''}
${codeContext ? `App Code Snippet:\n${codeContext}` : ''}

Generate the optimal title, SEO description, faviconLabel, and subdomain.`;

  try {
    const { data, error } = await supabase.functions.invoke('chat', {
      body: {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        model: 'gpt-5.6-luna',
      },
    });

    if (error || !data) {
      return fallback;
    }

    const raw = data?.choices?.[0]?.message?.content?.trim();
    if (!raw) return fallback;

    // Clean any markdown code blocks if the model enclosed it
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(jsonStr);

    const title = typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim().replace(/^["']|["']$/g, '')
      : fallback.title;

    const description = typeof parsed.description === 'string' && parsed.description.trim()
      ? parsed.description.trim()
      : fallback.description;

    const matchedFavicon = typeof parsed.faviconLabel === 'string' && VALID_FAVICON_LABELS.has(parsed.faviconLabel.trim())
      ? parsed.faviconLabel.trim()
      : fallback.faviconLabel;

    const sub = typeof parsed.subdomain === 'string' && parsed.subdomain.trim()
      ? slugify(parsed.subdomain)
      : slugify(title);

    return {
      title,
      description,
      faviconLabel: matchedFavicon,
      subdomain: sub.length >= 3 ? sub : fallback.subdomain,
    };
  } catch (err) {
    console.warn('generateAppSeoMetadata failed, using fallback:', err);
    return fallback;
  }
}
