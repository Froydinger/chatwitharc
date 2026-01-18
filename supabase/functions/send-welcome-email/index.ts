import React from 'https://esm.sh/react@18.3.1'
import { Resend } from 'https://esm.sh/resend@4.0.0'
import { renderAsync } from 'https://esm.sh/@react-email/components@0.0.22'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const resend = new Resend(Deno.env.get('RESEND_API_KEY') as string)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Design tokens matching ArcAI brand
const colors = {
  background: '#050505',
  surface: '#0f0f0f',
  surfaceLight: '#1a1a1a',
  primary: '#3b82f6',
  primaryGlow: '#06b6d4',
  text: '#ffffff',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',
  border: '#27272a',
  accent: '#8b5cf6',
}

// Inline the email template to avoid import issues
const generateWelcomeEmailHtml = (displayName: string, baseUrl: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="background-color: ${colors.background}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; margin: 0; padding: 0;">
  <div style="margin: 0 auto; padding: 0; width: 100%; max-width: 560px;">
    
    <!-- Header with gradient -->
    <div style="background: linear-gradient(135deg, ${colors.accent} 0%, ${colors.primary} 50%, ${colors.primaryGlow} 100%); padding: 48px 0 64px; text-align: center; border-radius: 0 0 24px 24px;">
      <img src="${baseUrl}/arc-logo-ui.png" width="80" height="80" alt="ArcAI" style="margin: 0 auto; border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.3);">
    </div>
    
    <!-- Main Card -->
    <div style="background-color: ${colors.surface}; margin: -32px 20px 0; padding: 36px 28px; border-radius: 20px; border: 1px solid ${colors.border}; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);">
      <p style="font-size: 48px; text-align: center; margin: 0 0 16px;">🎉</p>
      
      <h1 style="color: ${colors.text}; font-size: 28px; font-weight: 700; text-align: center; margin: 0 0 16px;">
        Welcome, ${displayName}!
      </h1>
      
      <p style="color: ${colors.textSecondary}; font-size: 15px; line-height: 24px; text-align: center; margin: 0 0 28px;">
        Your account is all set up and ready to go. 
        You're now part of a growing community of creators, developers, 
        and thinkers using AI to do amazing things.
      </p>
      
      <div style="text-align: center; margin: 0 0 28px;">
        <a href="${baseUrl}" style="background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryGlow} 100%); border-radius: 10px; color: ${colors.text}; font-size: 16px; font-weight: 600; text-decoration: none; text-align: center; display: inline-block; padding: 14px 36px; border: none; box-shadow: 0 8px 20px ${colors.primary}30;">
          Start Chatting
        </a>
      </div>
      
      <hr style="border-color: ${colors.border}; margin: 0 0 24px; border-style: solid; border-width: 1px 0 0 0;">
      
      <!-- Tips Section -->
      <p style="color: ${colors.textSecondary}; font-size: 14px; font-weight: 500; margin: 0 0 20px;">Quick tips to get started:</p>
      
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="width: 40px; vertical-align: top; padding-bottom: 16px;">
            <span style="font-size: 20px;">💡</span>
          </td>
          <td style="vertical-align: top; padding-bottom: 16px;">
            <p style="color: ${colors.text}; font-size: 14px; font-weight: 600; margin: 0 0 2px;">Just ask naturally</p>
            <p style="color: ${colors.textMuted}; font-size: 13px; margin: 0;">Type or speak like you're talking to a friend</p>
          </td>
        </tr>
        <tr>
          <td style="width: 40px; vertical-align: top; padding-bottom: 16px;">
            <span style="font-size: 20px;">🎨</span>
          </td>
          <td style="vertical-align: top; padding-bottom: 16px;">
            <p style="color: ${colors.text}; font-size: 14px; font-weight: 600; margin: 0 0 2px;">Generate images</p>
            <p style="color: ${colors.textMuted}; font-size: 13px; margin: 0;">Use /image or tap the image button to create visuals</p>
          </td>
        </tr>
        <tr>
          <td style="width: 40px; vertical-align: top; padding-bottom: 16px;">
            <span style="font-size: 20px;">🔍</span>
          </td>
          <td style="vertical-align: top; padding-bottom: 16px;">
            <p style="color: ${colors.text}; font-size: 14px; font-weight: 600; margin: 0 0 2px;">Research anything</p>
            <p style="color: ${colors.textMuted}; font-size: 13px; margin: 0;">Use /search for real-time web information</p>
          </td>
        </tr>
        <tr>
          <td style="width: 40px; vertical-align: top;">
            <span style="font-size: 20px;">✍️</span>
          </td>
          <td style="vertical-align: top;">
            <p style="color: ${colors.text}; font-size: 14px; font-weight: 600; margin: 0 0 2px;">Write & code</p>
            <p style="color: ${colors.textMuted}; font-size: 13px; margin: 0;">Use /write or /code for canvas mode</p>
          </td>
        </tr>
      </table>
    </div>
    
    <!-- Footer -->
    <div style="padding: 28px 20px; text-align: center;">
      <p style="color: ${colors.textSecondary}; font-size: 13px; margin: 0 0 12px;">
        Need help? Just ask ArcAI anything!
      </p>
      <p style="color: ${colors.textMuted}; font-size: 12px; margin: 0;">
        © 2025 ArcAI by Win The Night Productions
      </p>
    </div>
  </div>
</body>
</html>
`

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405,
      headers: corsHeaders 
    })
  }

  try {
    // Verify the user is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    const { user_name } = await req.json()
    
    const displayName = user_name || user.email?.split('@')[0] || 'there'
    const baseUrl = 'https://chatwitharc.lovable.app'

    console.log(`📧 Sending welcome email to ${user.email} (${displayName})`)

    const html = generateWelcomeEmailHtml(displayName, baseUrl)

    const { error } = await resend.emails.send({
      from: 'ArcAI <hello@askarc.chat>',
      to: [user.email!],
      subject: '🎉 Welcome to ArcAI - Your AI journey begins!',
      html,
    })

    if (error) {
      console.error('Resend error:', error)
      throw error
    }

    console.log(`✅ Welcome email sent successfully to ${user.email}`)

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    })
  } catch (error: unknown) {
    console.error('Welcome email error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    )
  }
})
