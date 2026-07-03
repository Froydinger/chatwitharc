import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CUSTOM_DOMAIN = 'askarc.chat';

// Names that would collide with (or squat on) ArcAI's own infrastructure.
const RESERVED_SUBDOMAINS = new Set([
  'www', 'app', 'api', 'mail', 'email', 'admin', 'blog', 'docs', 'status',
  'support', 'help', 'dashboard', 'chat', 'cdn', 'static', 'assets',
  'dev', 'staging', 'test', 'arc', 'arcai', 'askarc',
]);

function normalizeSubdomain(s: string | undefined | null): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // --- auth ---
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonRes({ error: 'Unauthorized' }, 401);
  }
  let authenticatedUserId = '';
  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return jsonRes({ error: 'Unauthorized' }, 401);
    authenticatedUserId = user.id;
  } catch {
    return jsonRes({ error: 'Unauthorized' }, 401);
  }

  const NETLIFY_ACCESS_TOKEN = Deno.env.get('NETLIFY_ACCESS_TOKEN');
  if (!NETLIFY_ACCESS_TOKEN) {
    return jsonRes({ error: 'NETLIFY_ACCESS_TOKEN not configured' }, 500);
  }

  // Service-role client for cross-user collision checks
  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  async function userOwnsSite(siteId: string): Promise<boolean> {
    const [{ data: publishedSite }, { data: ideProject }] = await Promise.all([
      serviceClient
        .from('published_sites')
        .select('id')
        .eq('user_id', authenticatedUserId)
        .eq('netlify_site_id', siteId)
        .maybeSingle(),
      serviceClient
        .from('ide_projects')
        .select('id')
        .eq('user_id', authenticatedUserId)
        .eq('netlify_site_id', siteId)
        .maybeSingle(),
    ]);
    return Boolean(publishedSite || ideProject);
  }

  // Find a Netlify site already serving a given custom domain. Returns site_id or null.
  async function findNetlifySiteByDomain(domain: string): Promise<string | null> {
    try {
      // Search by name filter is unreliable; pull list and match. Pagination cap = 100 (we'll have far fewer).
      const r = await fetch(`https://api.netlify.com/api/v1/sites?per_page=100`, {
        headers: { 'Authorization': `Bearer ${NETLIFY_ACCESS_TOKEN}` },
      });
      if (!r.ok) return null;
      const sites = await r.json();
      const match = (sites as Array<Record<string, unknown>>).find((s) => {
        const cd = String(s.custom_domain || '').toLowerCase();
        const aliases = (s.domain_aliases as string[] | undefined) || [];
        return cd === domain.toLowerCase() ||
          aliases.map((a) => a.toLowerCase()).includes(domain.toLowerCase());
      });
      return (match?.site_id || match?.id || null) as string | null;
    } catch (e) {
      console.error('findNetlifySiteByDomain error:', e);
      return null;
    }
  }

  try {
    const body = await req.json();

    // ============================================================
    // ACTION: delete (unpublish)
    // ============================================================
    if (body.action === 'delete') {
      const { siteId } = body;
      if (!siteId) return jsonRes({ error: 'Missing siteId' }, 400);
      if (!(await userOwnsSite(siteId))) {
        return jsonRes({ error: 'Published site not found' }, 404);
      }
      console.log('[DEPLOY] Deleting site:', siteId);
      const deleteController = new AbortController();
      const deleteTimeout = setTimeout(() => deleteController.abort(), 15000);
      try {
        const deleteRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${NETLIFY_ACCESS_TOKEN}` },
          signal: deleteController.signal,
        });
        clearTimeout(deleteTimeout);
        if (!deleteRes.ok && deleteRes.status !== 404) {
          const err = await deleteRes.text();
          console.error('[DEPLOY] Delete failed:', deleteRes.status, err);
          throw new Error(`Failed to delete site [${deleteRes.status}]: ${err}`);
        }
      } catch (e: unknown) {
        clearTimeout(deleteTimeout);
        if (e instanceof DOMException && e.name === 'AbortError') {
          return jsonRes({ error: 'Netlify delete timed out' }, 504);
        }
        throw e;
      }
      return jsonRes({ success: true });
    }

    // ============================================================
    // ACTION: check — real subdomain availability check
    // ============================================================
    if (body.action === 'check') {
      const sub = normalizeSubdomain(body.subdomain);
      if (!sub || sub.length < 2) {
        return jsonRes({ available: false, reason: 'invalid' });
      }
      if (RESERVED_SUBDOMAINS.has(sub)) {
        return jsonRes({ available: false, reason: 'reserved' });
      }
      // 1. DB check
      const { data: existing } = await serviceClient
        .from('published_sites')
        .select('id')
        .eq('subdomain', sub)
        .maybeSingle();
      if (existing) return jsonRes({ available: false, reason: 'taken' });

      // 2. Netlify check (catches domains attached to sites not in our DB)
      const fullDomain = `${sub}.${CUSTOM_DOMAIN}`;
      const netlifySiteId = await findNetlifySiteByDomain(fullDomain);
      if (netlifySiteId) return jsonRes({ available: false, reason: 'taken' });

      return jsonRes({ available: true });
    }

    // ============================================================
    // ACTION: deploy (default)
    // ============================================================
    const { zipBase64, subdomain, siteId } = body;
    if (!zipBase64) return jsonRes({ error: 'Missing zipBase64' }, 400);

    const userSubdomain = normalizeSubdomain(subdomain || 'app');
    if (!userSubdomain) return jsonRes({ error: 'Invalid subdomain' }, 400);

    const customDomainUrl = `${userSubdomain}.${CUSTOM_DOMAIN}`;
    const isRedeploy = !!siteId;

    if (isRedeploy && !(await userOwnsSite(siteId))) {
      return jsonRes({ error: 'Published site not found' }, 404);
    }

    // --- Pre-flight collision check for NEW publishes only ---
    if (!isRedeploy) {
      if (RESERVED_SUBDOMAINS.has(userSubdomain)) {
        return jsonRes({ error: 'That address is reserved — pick a different one.' }, 409);
      }
      const { data: existing } = await serviceClient
        .from('published_sites')
        .select('id')
        .eq('subdomain', userSubdomain)
        .maybeSingle();
      if (existing) {
        return jsonRes({ error: 'That address is already taken — pick a different one.' }, 409);
      }
      const conflictingSiteId = await findNetlifySiteByDomain(customDomainUrl);
      if (conflictingSiteId) {
        return jsonRes({ error: 'That address is already taken — pick a different one.' }, 409);
      }
    }

    // --- Create or reuse Netlify site ---
    let targetSiteId = siteId;
    const randomSuffix = crypto.randomUUID().slice(0, 8);
    const siteName = `arc-${userSubdomain.slice(0, 30)}-${randomSuffix}`;

    if (!targetSiteId) {
      const createRes = await fetch('https://api.netlify.com/api/v1/sites', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NETLIFY_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: siteName }),
      });

      if (!createRes.ok) {
        const err = await createRes.text();
        if (createRes.status === 422) {
          return jsonRes({ error: 'That address is already taken — pick a different one.' }, 422);
        }
        throw new Error(`Failed to create Netlify site [${createRes.status}]: ${err}`);
      }
      const siteData = await createRes.json();
      targetSiteId = siteData.site_id || siteData.id;
    }

    // --- Deploy the zip ---
    const zipBytes = Uint8Array.from(atob(zipBase64), c => c.charCodeAt(0));
    const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${targetSiteId}/deploys`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NETLIFY_ACCESS_TOKEN}`,
        'Content-Type': 'application/zip',
      },
      body: zipBytes,
    });

    if (!deployRes.ok) {
      const err = await deployRes.text();
      // If this was a brand-new site, clean it up so we don't orphan it
      if (!isRedeploy && targetSiteId) {
        await fetch(`https://api.netlify.com/api/v1/sites/${targetSiteId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${NETLIFY_ACCESS_TOKEN}` },
        }).catch(() => {});
      }
      throw new Error(`Netlify deploy failed [${deployRes.status}]: ${err}`);
    }
    const deployData = await deployRes.json();

    // --- Attach custom domain (REQUIRED for new publishes) ---
    if (!isRedeploy) {
      const domainRes = await fetch(`https://api.netlify.com/api/v1/sites/${targetSiteId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${NETLIFY_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ custom_domain: customDomainUrl }),
      });
      if (!domainRes.ok) {
        const errText = await domainRes.text();
        console.error('Custom domain PATCH failed:', domainRes.status, errText);
        // Domain attach failed — clean up the new Netlify site so we don't orphan it
        await fetch(`https://api.netlify.com/api/v1/sites/${targetSiteId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${NETLIFY_ACCESS_TOKEN}` },
        }).catch(() => {});
        return jsonRes({ error: 'That address is already taken — pick a different one.' }, 409);
      }
      // Best-effort SSL provisioning
      try {
        await fetch(`https://api.netlify.com/api/v1/sites/${targetSiteId}/ssl`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${NETLIFY_ACCESS_TOKEN}` },
        });
      } catch (sslErr) {
        console.warn('SSL provisioning request failed (may auto-provision):', sslErr);
      }
    }

    return jsonRes({
      success: true,
      url: `https://${customDomainUrl}`,
      netlifyUrl: deployData.ssl_url || deployData.deploy_ssl_url || `https://${siteName}.netlify.app`,
      siteId: targetSiteId,
      deployId: deployData.id,
      subdomain: userSubdomain,
    });
  } catch (error: unknown) {
    console.error('Deploy error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonRes({ error: message }, 500);
  }
});
