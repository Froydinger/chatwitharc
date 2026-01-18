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
      // Return warning message and confirmation code
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
      // Validate confirmation code format
      if (!confirmationCode || !confirmationCode.startsWith(`DELETE_${user.id.slice(0, 8)}_`)) {
        return new Response(
          JSON.stringify({ error: 'Invalid confirmation code' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`🗑️ Starting FULL account deletion for user: ${user.id} (${user.email})`)

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

      // Delete user's data from all tables
      const deletionResults: Record<string, boolean> = {}

      // 1. Delete chat sessions
      const { error: sessionsError } = await supabaseAdmin
        .from('chat_sessions')
        .delete()
        .eq('user_id', user.id)
      deletionResults.chatSessions = !sessionsError
      if (sessionsError) console.error('Error deleting chat sessions:', sessionsError)

      // 2. Delete search sessions
      const { error: searchError } = await supabaseAdmin
        .from('search_sessions')
        .delete()
        .eq('user_id', user.id)
      deletionResults.searchSessions = !searchError
      if (searchError) console.error('Error deleting search sessions:', searchError)

      // 3. Delete saved links
      const { error: linksError } = await supabaseAdmin
        .from('saved_links')
        .delete()
        .eq('user_id', user.id)
      deletionResults.savedLinks = !linksError
      if (linksError) console.error('Error deleting saved links:', linksError)

      // 4. Delete generated files
      const { error: filesError } = await supabaseAdmin
        .from('generated_files')
        .delete()
        .eq('user_id', user.id)
      deletionResults.generatedFiles = !filesError
      if (filesError) console.error('Error deleting generated files:', filesError)

      // 5. Delete profile
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('user_id', user.id)
      deletionResults.profile = !profileError
      if (profileError) console.error('Error deleting profile:', profileError)

      // 6. Delete the auth user account entirely
      const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
      deletionResults.authUser = !deleteUserError
      if (deleteUserError) {
        console.error('Error deleting auth user:', deleteUserError)
        return new Response(
          JSON.stringify({ 
            error: 'Failed to delete user account',
            details: deleteUserError.message 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`✅ Successfully deleted user account and all data for: ${user.id}`)

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Your account and all data have been permanently deleted.',
          deleted: deletionResults
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
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
