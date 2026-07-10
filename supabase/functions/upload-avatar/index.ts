import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_BYTES = 5 * 1024 * 1024
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function decodeBase64(input: string): Uint8Array {
  const clean = input.includes(',') ? input.split(',').pop() ?? '' : input
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const authHeader = req.headers.get('Authorization') ?? ''

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: 'Server configuration error' }, 500)
  }

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: userData, error: userError } = await supabaseUser.auth.getUser()
  const user = userData?.user

  if (userError || !user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  let body: { base64?: string; contentType?: string; fileName?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const contentType = (body.contentType ?? '').toLowerCase()
  const ext = MIME_TO_EXT[contentType] ?? body.fileName?.split('.').pop()?.toLowerCase()

  if (!body.base64 || !contentType.startsWith('image/') || !ext) {
    return json({ error: 'A valid image file is required' }, 400)
  }

  if (!Object.values(MIME_TO_EXT).includes(ext)) {
    return json({ error: 'Unsupported image type' }, 400)
  }

  let bytes: Uint8Array
  try {
    bytes = decodeBase64(body.base64)
  } catch {
    return json({ error: 'Invalid image payload' }, 400)
  }

  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    return json({ error: 'Image must be smaller than 5MB' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const path = `${user.id}/avatar.${ext}`
  const { error: uploadError } = await admin.storage.from('avatars').upload(path, bytes, {
    contentType,
    upsert: true,
  })

  if (uploadError) {
    console.error('Avatar upload failed', uploadError)
    return json({ error: 'Avatar upload failed' }, 500)
  }

  const { data: urlData } = admin.storage.from('avatars').getPublicUrl(path)
  const avatarUrl = `${urlData.publicUrl}?v=${Date.now()}`

  const { error: profileError } = await admin
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('user_id', user.id)

  if (profileError) {
    console.error('Avatar profile update failed', profileError)
    return json({ error: 'Profile update failed' }, 500)
  }

  return json({ avatarUrl })
})
