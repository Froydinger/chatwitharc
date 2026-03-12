import JSZip from 'jszip';
import type { VirtualFileSystem } from '@/types/ide';
import { bundleProject, generatePreviewHtml, initializeEsbuild } from '@/lib/esbuild';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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
    .replace('<title>Preview</title>', `<title>${appName}</title>\n  ${faviconTag}`)
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
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/deploy-netlify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
      },
      body: JSON.stringify({ action: 'delete', siteId }),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || 'Unpublish failed');
    }
  } finally {
    clearTimeout(timeout);
  }
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
