import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify authentication
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ success: false, message: 'Authentication required' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
    );
  }

  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return new Response(
      JSON.stringify({ success: false, message: 'Invalid authentication' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
    );
  }

  try {
    const { userEmail, errorMessage, errorStack, description, url, userAgent } = await req.json();

    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      // Don't throw - just log it. Bug report is still saved in DB
      return new Response(
        JSON.stringify({ success: false, message: 'Email service not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Format email content
    const emailHtml = `
      <h2>🐛 New Bug Report</h2>

      <h3>User Information</h3>
      <p><strong>Email:</strong> ${userEmail || 'Not provided'}</p>
      <p><strong>URL:</strong> <a href="${url}">${url}</a></p>
      <p><strong>User Agent:</strong> ${userAgent}</p>

      <h3>User Description</h3>
      <p>${description.replace(/\n/g, '<br>')}</p>

      <h3>Error Message</h3>
      <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto;">${errorMessage}</pre>

      ${errorStack ? `
        <h3>Stack Trace</h3>
        <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; max-height: 400px; overflow-y: auto;">${errorStack}</pre>
      ` : ''}

      <hr>
      <p style="color: #666; font-size: 12px;">Sent from ArcAI Bug Report System</p>
    `;

    const emailText = `
New Bug Report

User Email: ${userEmail || 'Not provided'}
URL: ${url}

User Description:
${description}

Error Message:
${errorMessage}

${errorStack ? `Stack Trace:\n${errorStack}` : ''}
    `;

    // Send email using Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'ArcAI Bug Reports <noreply@updates.froydinger.com>',
        to: [ADMIN_EMAIL],
        reply_to: userEmail || undefined,
        subject: `🐛 Bug Report: ${errorMessage.substring(0, 50)}${errorMessage.length > 50 ? '...' : ''}`,
        html: emailHtml,
        text: emailText,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Resend API error:', response.status, errorData);
      return new Response(
        JSON.stringify({ success: false, message: 'Failed to send email' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const data = await response.json();
    console.log('Bug report email sent:', data.id);

    return new Response(
      JSON.stringify({ success: true, emailId: data.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in send-bug-report function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
