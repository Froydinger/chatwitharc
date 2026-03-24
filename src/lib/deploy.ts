import JSZip from 'jszip';
import type { VirtualFileSystem } from '@/types/ide';
import { bundleProject, generatePreviewHtml, initializeEsbuild } from '@/lib/esbuild';
import { canPreview } from '@/utils/codeUtils';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://jxywhodnndagbsmnbnnw.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4eXdob2RubmRhZ2JzbW5ibm53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTkwNjUsImV4cCI6MjA4MTY3NTA2NX0.tmqRRB4jbOOR0FWVsS8zXer_2IZLjzsPb2D3Ozu2bKk";

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const DEFAULT_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#6366f1"/><text x="50" y="68" text-anchor="middle" font-size="52" font-family="sans-serif" fill="white">🚀</text></svg>`;

function generateDeployHtml(bundledCode: string, appName: string, hasFavicon: boolean): string {
  const base = generatePreviewHtml(bundledCode);
  const faviconTag = hasFavicon
    ? `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`
    : `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(DEFAULT_FAVICON_SVG)}" type="image/svg+xml">`;
  return base
    .replace('</head>', `  <title>${appName}</title>\n  ${faviconTag}\n</head>`)
    .replace(`"development"`, `"production"`);
}

async function buildStaticZip(projectName: string, files: VirtualFileSystem, siteTitle?: string, faviconSvg?: string): Promise<Blob> {
  await initializeEsbuild();
  const bundledCode = await bundleProject(files);
  const html = generateDeployHtml(bundledCode, siteTitle || projectName, !!faviconSvg);

  const zip = new JSZip();
  zip.file('index.html', html);
  zip.file('_redirects', '/*    /index.html   200');
  if (faviconSvg) {
    zip.file('favicon.svg', faviconSvg);
  }
  return zip.generateAsync({ type: 'blob' });
}

export async function unpublishFromNetlify(siteId: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const { data: { session } } = await (await import('@/integrations/supabase/client')).supabase.auth.getSession();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/deploy-netlify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'delete', siteId }),
      signal: controller.signal,
    });
    let data: any;
    try {
      data = await res.json();
    } catch {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Unpublish failed (HTTP ${res.status})`);
    }
    if (!res.ok || data.error) {
      throw new Error(data.error || `Unpublish failed (HTTP ${res.status})`);
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Unpublish timed out — please try again');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export interface DeployCodeBlockOpts {
  subdomain?: string;
  title?: string;
  faviconSvg?: string;    // SVG string from emoji picker → stored as /favicon.svg in zip
  faviconData?: string;   // data URL from file upload → embedded directly in <link>
  ogTitle?: string;
  ogDescription?: string;
  ogImageUrl?: string;
  siteId?: string;        // existing Netlify site ID for re-deploys
}

/** Deploy a single raw code block — any language supported */
export async function deployCodeBlock(
  code: string,
  language: string,
  opts: DeployCodeBlockOpts = {},
): Promise<{ url: string; netlifyUrl?: string; siteId: string; subdomain: string }> {
  const {
    subdomain = `arc-code-${Date.now().toString(36)}`,
    title,
    faviconSvg,
    faviconData,
    ogTitle,
    ogDescription,
    ogImageUrl,
    siteId,
  } = opts;

  // Build OG / social meta tags
  const ogTags = [
    ogTitle        && `<meta property="og:title" content="${ogTitle.replace(/"/g, '&quot;')}">`,
    ogDescription  && `<meta property="og:description" content="${ogDescription.replace(/"/g, '&quot;')}">`,
    ogImageUrl     && `<meta property="og:image" content="${ogImageUrl.replace(/"/g, '&quot;')}">`,
    ogTitle        && `<meta name="twitter:card" content="summary_large_image">`,
    ogTitle        && `<meta name="twitter:title" content="${ogTitle.replace(/"/g, '&quot;')}">`,
    ogDescription  && `<meta name="twitter:description" content="${ogDescription.replace(/"/g, '&quot;')}">`,
    ogImageUrl     && `<meta name="twitter:image" content="${ogImageUrl.replace(/"/g, '&quot;')}">`,
  ].filter(Boolean).join('\n  ');

  // Favicon link tag — uploaded file takes priority over emoji SVG
  const faviconTag = faviconData
    ? `<link rel="icon" href="${faviconData}">`
    : faviconSvg
    ? `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`
    : '';

  const pageTitle = title || 'My Site';
  const headExtras = [faviconTag, ogTags].filter(Boolean).join('\n  ');

  // Wrap code in appropriate HTML for the given language
  let html: string;
  const lang = language.toLowerCase();

  if (lang === 'html') {
    // Inject into existing HTML
    html = code
      .replace(/<title>[^<]*<\/title>/, `<title>${pageTitle}</title>`)
      .replace('</head>', `  ${headExtras}\n</head>`);
    if (!html.includes('<title>')) {
      html = html.replace('<head>', `<head>\n  <title>${pageTitle}</title>\n  ${headExtras}`);
    }
  } else if (lang === 'css') {
    html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${pageTitle}</title>${headExtras}<style>${code}</style></head><body></body></html>`;
  } else if (canPreview(lang)) {
    html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${pageTitle}</title>${headExtras}</head><body><script type="module">${code}</script></body></html>`;
  } else {
    // Python, SQL, Bash, etc. — styled read-only code viewer
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${pageTitle}</title>${headExtras}<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#e6edf3;font-family:ui-monospace,SFMono-Regular,SF Mono,Menlo,monospace;padding:2rem;min-height:100vh}
pre{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1.5rem;overflow:auto;font-size:.875rem;line-height:1.6;white-space:pre}
.lang{display:inline-block;background:#21262d;color:#8b949e;font-size:.75rem;padding:.25rem .75rem;border-radius:4px;margin-bottom:1rem}
</style></head><body><div class="lang">${language}</div><pre>${escaped}</pre></body></html>`;
  }

  const zip = new JSZip();
  zip.file('index.html', html);
  zip.file('_redirects', '/*    /index.html   200');
  if (faviconSvg && !faviconData) {
    zip.file('favicon.svg', faviconSvg);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipBase64 = await blobToBase64(zipBlob);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/deploy-netlify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
    body: JSON.stringify({ zipBase64, subdomain, ...(siteId ? { siteId } : {}) }),
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Deploy failed (${res.status}): unexpected response from server`);
  }
  if (!res.ok || data.error) throw new Error((data.error as string) || `Deploy failed (${res.status})`);
  return { url: data.url as string, netlifyUrl: data.netlifyUrl as string | undefined, siteId: data.siteId as string, subdomain: data.subdomain as string };
}

export async function deployToNetlify(
  projectName: string,
  files: VirtualFileSystem,
  subdomain: string,
  siteId?: string | null,
  siteTitle?: string,
  faviconSvg?: string,
): Promise<{ url: string; netlifyUrl?: string; siteId: string; subdomain: string }> {
  const zipBlob = await buildStaticZip(projectName, files, siteTitle, faviconSvg);
  const zipBase64 = await blobToBase64(zipBlob);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/deploy-netlify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
    },
    body: JSON.stringify({
      zipBase64,
      subdomain,
      siteId: siteId || undefined,
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Deploy failed');
  }

  return { url: data.url, netlifyUrl: data.netlifyUrl, siteId: data.siteId, subdomain: data.subdomain };
}
