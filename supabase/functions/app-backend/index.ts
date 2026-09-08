import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonRes({ error: "Supabase credentials not configured on backend" }, 500);
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

  try {
    let body: any = {};
    if (req.method === "POST" || req.method === "PUT") {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    } else {
      const url = new URL(req.url);
      body = {
        projectId: url.searchParams.get("projectId") || undefined,
        subdomain: url.searchParams.get("subdomain") || undefined,
        action: url.searchParams.get("action") || "get-data",
      };
    }

    const { projectId, subdomain, action = "get-data", payload = {} } = body;

    if (!projectId && !subdomain) {
      return jsonRes({ error: "Missing projectId or subdomain" }, 400);
    }

    // Locate matching ide_project in Supabase
    let query = serviceClient.from("ide_projects").select("id, versions, netlify_subdomain");
    if (projectId && projectId !== "default") {
      query = query.eq("id", projectId);
    } else if (subdomain) {
      query = query.eq("netlify_subdomain", subdomain);
    }

    const { data: proj, error: findError } = await query.maybeSingle();

    if (findError || !proj) {
      // Fallback: If querying by subdomain failed, try finding with like match
      if (subdomain) {
        const { data: fallbackProj } = await serviceClient
          .from("ide_projects")
          .select("id, versions, netlify_subdomain")
          .ilike("netlify_subdomain", `%${subdomain}%`)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fallbackProj) {
          return await handleProjectOperation(serviceClient, fallbackProj, action, payload);
        }
      }

      return jsonRes({
        success: false,
        warning: "Project not yet persisted in cloud or not found",
        users: [],
        db: {},
      }, 200);
    }

    return await handleProjectOperation(serviceClient, proj, action, payload);
  } catch (err: unknown) {
    console.error("[app-backend] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonRes({ error: message }, 500);
  }
});

async function handleProjectOperation(
  serviceClient: any,
  proj: { id: string; versions: any; netlify_subdomain: string | null },
  action: string,
  payload: any
) {
  const versions = (proj.versions && typeof proj.versions === "object" && !Array.isArray(proj.versions))
    ? { ...proj.versions }
    : {};

  const appUsers: any[] = Array.isArray(versions.app_users) ? [...versions.app_users] : [];
  const appDb: Record<string, any> = (versions.app_db && typeof versions.app_db === "object" && !Array.isArray(versions.app_db))
    ? { ...versions.app_db }
    : {};

  if (action === "get-data" || action === "sync") {
    return jsonRes({
      success: true,
      projectId: proj.id,
      users: appUsers,
      db: appDb,
    });
  }

  if (action === "auth-signup") {
    const newUser = payload?.user;
    if (newUser?.email) {
      const email = newUser.email.trim().toLowerCase();
      const existingIdx = appUsers.findIndex((u) => u?.email?.toLowerCase() === email);
      const userRecord = {
        id: newUser.id || Math.random().toString(36).substring(2, 9),
        email,
        name: newUser.name || email.split("@")[0],
        avatar: newUser.avatar,
        role: newUser.role || (appUsers.length === 0 ? "Admin" : "User"),
        status: "Active",
        created_at: newUser.created_at || new Date().toISOString(),
      };

      if (existingIdx >= 0) {
        appUsers[existingIdx] = { ...appUsers[existingIdx], ...userRecord };
      } else {
        appUsers.unshift(userRecord);
      }

      versions.app_users = appUsers;
      await serviceClient
        .from("ide_projects")
        .update({ versions, updated_at: new Date().toISOString() })
        .eq("id", proj.id);

      return jsonRes({
        success: true,
        user: userRecord,
        users: appUsers,
      });
    }
    return jsonRes({ error: "Invalid user data" }, 400);
  }

  if (action === "auth-signin") {
    const email = (payload?.email || "").trim().toLowerCase();
    const user = appUsers.find((u) => u?.email?.toLowerCase() === email);
    if (user) {
      return jsonRes({ success: true, user });
    }
    // If not found in cloud registry, allow sign-in and register automatically
    const autoUser = {
      id: Math.random().toString(36).substring(2, 9),
      email,
      name: email.split("@")[0],
      role: "User",
      status: "Active",
      created_at: new Date().toISOString(),
    };
    appUsers.unshift(autoUser);
    versions.app_users = appUsers;
    await serviceClient
      .from("ide_projects")
      .update({ versions, updated_at: new Date().toISOString() })
      .eq("id", proj.id);

    return jsonRes({ success: true, user: autoUser, users: appUsers });
  }

  if (action === "collection-change") {
    const { collection, items } = payload || {};
    if (collection) {
      appDb[`collection:${collection}`] = items || [];
      versions.app_db = appDb;
      await serviceClient
        .from("ide_projects")
        .update({ versions, updated_at: new Date().toISOString() })
        .eq("id", proj.id);

      return jsonRes({ success: true, collection, items });
    }
    return jsonRes({ error: "Missing collection name" }, 400);
  }

  if (action === "db-set") {
    const { key, value } = payload || {};
    if (key) {
      appDb[key] = value;
      versions.app_db = appDb;
      await serviceClient
        .from("ide_projects")
        .update({ versions, updated_at: new Date().toISOString() })
        .eq("id", proj.id);

      return jsonRes({ success: true, key, value });
    }
    return jsonRes({ error: "Missing database key" }, 400);
  }

  if (action === "db-delete") {
    const { key } = payload || {};
    if (key) {
      delete appDb[key];
      versions.app_db = appDb;
      await serviceClient
        .from("ide_projects")
        .update({ versions, updated_at: new Date().toISOString() })
        .eq("id", proj.id);

      return jsonRes({ success: true, key });
    }
    return jsonRes({ error: "Missing database key" }, 400);
  }

  return jsonRes({ error: `Unknown action: ${action}` }, 400);
}
