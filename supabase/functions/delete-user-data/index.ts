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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
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
          warning: "⚠️ PERMANENT DELETE WARNING ⚠️\n\nThis action will PERMANENTLY delete:\n• All your chat sessions and conversations\n• Your profile information\n• Your memory data\n\nThis action CANNOT be undone.\n\nType the confirmation code to proceed:",
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

      console.log(`Starting data deletion for user: ${user.id}`)

      // Delete user's chat sessions (RLS ensures only their data is deleted)
      const { error: sessionsError } = await supabase
        .from('chat_sessions')
        .delete()
        .eq('user_id', user.id)

      if (sessionsError) {
        console.error('Error deleting chat sessions:', sessionsError)
        return new Response(
          JSON.stringify({ error: 'Failed to delete chat sessions' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Clear profile data but keep the record (just clear personal info)
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          display_name: 'Deleted User',
          avatar_url: null,
          memory_info: null,
          context_info: null
        })
        .eq('user_id', user.id)

      if (profileError) {
        console.error('Error clearing profile:', profileError)
        return new Response(
          JSON.stringify({ error: 'Failed to clear profile data' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`Successfully deleted data for user: ${user.id}`)

      return new Response(
        JSON.stringify({
          success: true,
          message: 'All your data has been permanently deleted.',
          deleted: {
            chatSessions: true,
            profileData: true
          }
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
