import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create client with user's auth for verification
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      console.error('Authentication error:', authError)
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { action, confirmationCode } = await req.json()

    if (action === 'get_warning') {
      // Require an explicit, short-lived confirmation so stale dialogs cannot
      // be replayed after the user has left the deletion flow.
      const warningCode = `DELETE_${user.id.slice(0, 8)}_${Date.now()}`
      
      return new Response(
        JSON.stringify({
          warning: "⚠️ PERMANENT DELETE WARNING ⚠️\n\nThis action will PERMANENTLY delete:\n• All your chat sessions and conversations\n• Your profile information\n• Your memory data\n• Your account entirely\n\nThis action CANNOT be undone.\n\nType the confirmation code to proceed:",
          confirmationCode: warningCode,
          message: "Data deletion requires confirmation"
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (action === 'confirm_delete') {
      const codeMatch = typeof confirmationCode === 'string'
        ? /^DELETE_([a-f0-9]{8})_(\d{13})$/.exec(confirmationCode)
        : null
      const issuedAt = codeMatch ? Number(codeMatch[2]) : 0
      const isRecent = issuedAt > 0 && Date.now() - issuedAt >= 0 && Date.now() - issuedAt <= 10 * 60 * 1000
      if (!codeMatch || codeMatch[1] !== user.id.slice(0, 8) || !isRecent) {
        return new Response(
          JSON.stringify({ error: 'Invalid or expired confirmation code' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Create admin client with service role for full deletion
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      )

      const { data: owner, error: ownerError } = await supabaseAdmin.from('admin_users').select('is_primary_admin').eq('user_id',user.id).maybeSingle();
      if (ownerError) throw ownerError;
      if (owner?.is_primary_admin) return new Response(JSON.stringify({error:'Transfer ownership to another administrator before deleting an owner account.'}),{status:400,headers:{...corsHeaders,'Content-Type':'application/json'}});
      const access = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(n=>n.toString(16).padStart(2,'0')).join('');
      const tokenHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(access)))).map(n=>n.toString(16).padStart(2,'0')).join('');
      const {data:emailHash,error:hashError}=await supabaseAdmin.rpc('account_email_hash',{p_email:user.email??''});
      if(hashError)throw hashError;
      const {data:existing,error:existingError}=await supabaseAdmin.from('account_lifecycle').select('id,kind').eq('user_id',user.id).maybeSingle();
      if(existingError)throw existingError;
      const payload={state:'deleting',token_hash:tokenHash,delete_after:new Date().toISOString(),lease_until:null,email:user.email??'',updated_at:new Date().toISOString()};
      const queued=existing
        ? await supabaseAdmin.from('account_lifecycle').update(payload).eq('id',existing.id)
        : await supabaseAdmin.from('account_lifecycle').insert({...payload,user_id:user.id,email_hash:emailHash,kind:'self_delete'});
      if(queued.error)throw queued.error;
      const {error:banError}=await supabaseAdmin.auth.admin.updateUserById(user.id,{ban_duration:'876000h'});
      if(banError)throw banError;
      const {error:freezeError}=await supabaseAdmin.rpc('freeze_account_work',{p_user:user.id});
      if(freezeError)throw freezeError;
      return new Response(JSON.stringify({success:true,pending:true,statusToken:access,message:'Deletion requested. Cleanup will run automatically; this link shows completion.'}),{headers:{...corsHeaders,'Content-Type':'application/json'}});
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Delete function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
