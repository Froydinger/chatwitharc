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

      // Delete user's data from all tables that store per-user data
      const deletionResults: Record<string, boolean> = {}

      const userTables: Array<{ table: string; column?: string }> = [
        { table: 'chat_sessions' },
        { table: 'search_sessions' },
        { table: 'saved_links' },
        { table: 'generated_files' },
        { table: 'context_blocks' },
        { table: 'ide_projects' },
        { table: 'image_generation_jobs' },
        { table: 'published_sites' },
        { table: 'daily_image_usage' },
        { table: 'voice_diagnostics' },
        { table: 'ticket_messages', column: 'sender_id' },
        { table: 'support_tickets' },
        { table: 'profiles' },
      ]

      for (const { table, column } of userTables) {
        const { error } = await supabaseAdmin
          .from(table)
          .delete()
          .eq(column ?? 'user_id', user.id)
        deletionResults[table] = !error
        if (error) console.error(`Error deleting ${table}:`, error)
      }

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
