import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const NETLIFY_ACCESS_TOKEN = Deno.env.get('NETLIFY_ACCESS_TOKEN');
  if (!NETLIFY_ACCESS_TOKEN) {
    return new Response(JSON.stringify({ error: 'NETLIFY_ACCESS_TOKEN not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();

    // --- Delete site (unpublish) ---
    if (body.action === 'delete') {
      const { siteId } = body;
      if (!siteId) {
        return new Response(JSON.stringify({ error: 'Missing siteId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const deleteRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${NETLIFY_ACCESS_TOKEN}` },
      });
      if (!deleteRes.ok && deleteRes.status !== 404) {
        const err = await deleteRes.text();
        throw new Error(`Failed to delete site [${deleteRes.status}]: ${err}`);
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Check subdomain availability ---
    if (body.action === 'check') {
      // Custom domains — subdomain just needs to be valid
      return new Response(JSON.stringify({ available: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Deploy ---
    const { zipBase64, subdomain, siteId } = body;

    if (!zipBase64) {
      return new Response(JSON.stringify({ error: 'Missing zipBase64' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let targetSiteId = siteId;
    const randomSuffix = crypto.randomUUID().slice(0, 8);
    const siteName = `arc-${(subdomain || 'app').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30)}-${randomSuffix}`;

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
          return new Response(JSON.stringify({ error: `Subdomain "${siteName}" is already taken. Try a different name.` }), {
            status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`Failed to create Netlify site [${createRes.status}]: ${err}`);
      }

      const siteData = await createRes.json();
      targetSiteId = siteData.site_id || siteData.id;
    } else if (subdomain) {
      await fetch(`https://api.netlify.com/api/v1/sites/${targetSiteId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${NETLIFY_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: siteName }),
      });
    }

    // Deploy the zip
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
      throw new Error(`Netlify deploy failed [${deployRes.status}]: ${err}`);
    }

    const deployData = await deployRes.json();

    // Attach custom domain
    const CUSTOM_DOMAIN = 'froydingermedia.online';
    const userSubdomain = (subdomain || 'app').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 50);
    const customDomainUrl = `${userSubdomain}.${CUSTOM_DOMAIN}`;
    try {
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
      } else {
        console.log('Custom domain set:', customDomainUrl);
        try {
          await fetch(`https://api.netlify.com/api/v1/sites/${targetSiteId}/ssl`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${NETLIFY_ACCESS_TOKEN}` },
          });
        } catch (sslErr) {
          console.warn('SSL provisioning request failed (may auto-provision):', sslErr);
        }
      }
    } catch (e) {
      console.error('Failed to set custom domain:', e);
    }

    return new Response(JSON.stringify({
      success: true,
      url: `https://${customDomainUrl}`,
      netlifyUrl: `https://${siteName}.netlify.app`,
      siteId: targetSiteId,
      deployId: deployData.id,
      subdomain: userSubdomain,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Deploy error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
