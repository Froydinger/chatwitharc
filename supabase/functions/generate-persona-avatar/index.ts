// Generates a fun cartoon line-art persona avatar via OpenAI Gateway
// (gpt-image-2, medium quality) and uploads it to the public
// `avatars` bucket. Returns the public URL.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth: confirm caller
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const name: string = (body?.name || "").toString().trim().slice(0, 80);
    const description: string = (body?.description || "").toString().trim().slice(0, 400);
    const systemPrompt: string = (body?.systemPrompt || "").toString().trim().slice(0, 800);
    const personaId: string | undefined = body?.personaId
      ? String(body.personaId)
      : undefined;
    if (!name) {
      return new Response(JSON.stringify({ error: "name required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imagePrompt = `Avatar sticker, HEAD AND HAT ONLY (no neck, no shoulders, no torso, no hands, no held objects). Centered circular composition, head fills ~75% of frame. Consistent cartoon line-art style: uniform 4px bold black ink outlines, flat pastel fill colors, soft pink cheek circles, simple dot eyes with small white highlight, friendly closed-mouth smile. Solid white background. Subject: "${name}"${
      description ? ` — ${description}` : ""
    }${
      systemPrompt ? `. Vibe hint: ${systemPrompt.slice(0, 160)}` : ""
    }. Pick ONE distinctive hat or hairstyle and one small head-area accessory that fits this persona. No text, no logos, no props held in hands.`;


    // Call OpenAI OpenAI → OpenAI GPT-Image-2 (medium quality, square)
    const aiRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-2",
        prompt: imagePrompt,
        size: "1024x1024",
        quality: "medium",
        n: 1,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Image generation failed", detail: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const b64: string | undefined = aiJson?.data?.[0]?.b64_json;
    if (!b64) {
      return new Response(JSON.stringify({ error: "No image returned", raw: aiJson }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Decode and upload
    const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const path = `persona-avatars/${user.id}/${crypto.randomUUID()}.png`;
    const { error: upErr } = await admin.storage.from("avatars").upload(path, binary, {
      contentType: "image/png",
      upsert: false,
    });
    if (upErr) {
      return new Response(JSON.stringify({ error: "Upload failed", detail: upErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: pub } = admin.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = pub.publicUrl;

    // If personaId provided and it belongs to this user, persist it
    if (personaId && !personaId.startsWith("builtin-")) {
      await admin
        .from("personas")
        .update({ avatar_url: avatarUrl })
        .eq("id", personaId)
        .eq("user_id", user.id);
    }

    return new Response(JSON.stringify({ avatarUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
