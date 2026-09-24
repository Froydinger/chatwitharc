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

      const deletionResults: Record<string, boolean> = {}
      const userTables: Array<{ table: string; column?: string }> = [
        { table: 'chat_sessions' },
        { table: 'search_sessions' },
        { table: 'saved_links' },
        { table: 'generated_files' },
        { table: 'context_blocks' },
        { table: 'memory_summaries' },
        { table: 'ide_projects' },
        { table: 'image_generation_jobs' },
        { table: 'published_sites' },
        { table: 'daily_image_usage' },
        { table: 'daily_video_usage' },
        { table: 'video_generation_jobs' },
        { table: 'research_usage' },
        { table: 'voice_daily_usage' },
        { table: 'voice_conversations' },
        { table: 'voice_diagnostics' },
        { table: 'push_subscriptions' },
        { table: 'chat_folders' },
        { table: 'subscriptions' },
        { table: 'google_play_subscriptions' },
        { table: 'bug_reports' },
        { table: 'ticket_messages', column: 'sender_id' },
        { table: 'support_tickets' },
        { table: 'user_blocks', column: 'blocker_user_id' },
        { table: 'user_blocks', column: 'blocked_user_id' },
        { table: 'admin_users' },
        { table: 'profiles' },
        { table: 'shared_chat_messages', column: 'author_user_id' },
        { table: 'shared_chat_members' },
        { table: 'shared_chat_invites', column: 'invited_by' },
        { table: 'shared_chats', column: 'owner_id' },
      ]

      for (const { table, column } of userTables) {
        const { error } = await supabaseAdmin
          .from(table)
          .delete()
          .eq(column ?? 'user_id', user.id)
        deletionResults[table] = !error
        if (error) {
          console.error(`Account deletion stopped while removing ${table}:`, error.message)
          return new Response(
            JSON.stringify({ error: 'Account deletion stopped after a data cleanup step failed. Some account data may already have been removed. Please retry or contact ArcAI support.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      // Remove invitations sent to the account as well as invitations it sent.
      if (user.email) {
        const { error: inviteError } = await supabaseAdmin
          .from('shared_chat_invites')
          .delete()
          .ilike('email', user.email)
        deletionResults.receivedInvites = !inviteError
        if (inviteError) {
          console.error('Account deletion stopped while removing received invitations:', inviteError.message)
          return new Response(
            JSON.stringify({ error: 'Account deletion stopped after a data cleanup step failed. Some account data may already have been removed. Please retry or contact ArcAI support.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const { error: compedUserError } = await supabaseAdmin
          .from('comped_users')
          .delete()
          .ilike('email', user.email)
        deletionResults.compedAccess = !compedUserError
        if (compedUserError) {
          console.error('Account deletion stopped while removing email-based access:', compedUserError.message)
          return new Response(
            JSON.stringify({ error: 'Account deletion stopped after a data cleanup step failed. Some account data may already have been removed. Please retry or contact ArcAI support.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      // User uploads are stored under the account ID in these buckets.
      const removeUserFiles = async (bucket: string, prefix: string, depth = 0): Promise<void> => {
        if (depth > 8) throw new Error(`Storage folder nesting exceeded for ${bucket}`)
        const { data: entries, error } = await supabaseAdmin.storage.from(bucket).list(prefix, { limit: 1000 })
        if (error) throw new Error(`${bucket}: ${error.message}`)
        const objectPaths: string[] = []
        for (const entry of entries ?? []) {
          const path = `${prefix}/${entry.name}`
          if (entry.id) objectPaths.push(path)
          else await removeUserFiles(bucket, path, depth + 1)
        }
        for (let index = 0; index < objectPaths.length; index += 100) {
          const { error: removeError } = await supabaseAdmin.storage.from(bucket).remove(objectPaths.slice(index, index + 100))
          if (removeError) throw new Error(`${bucket}: ${removeError.message}`)
        }
      }

      for (const bucket of ['avatars', 'generated-files', 'cloud-chat-inputs', 'ticket-attachments']) {
        try {
          await removeUserFiles(bucket, user.id)
          deletionResults[`storage:${bucket}`] = true
        } catch (error) {
          const message = error instanceof Error ? error.message : 'storage deletion failed'
          console.error(`Account deletion stopped while removing ${bucket} files:`, message)
          return new Response(
            JSON.stringify({ error: 'Account deletion stopped while removing account files. Some account data or files may already have been removed. Please retry or contact ArcAI support.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      // Delete the auth user only after all owned rows and files were removed.
      const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
      deletionResults.authUser = !deleteUserError
      if (deleteUserError) {
        console.error('Account deletion could not remove the authenticated account:', deleteUserError.message)
        return new Response(
          JSON.stringify({ error: 'Failed to delete the ArcAI account.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log('ArcAI account deletion completed successfully.')

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
