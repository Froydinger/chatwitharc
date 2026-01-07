import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HTML escape function to prevent XSS in emails
function escapeHtml(text: string): string {
  if (!text) return '';
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

// Sanitize stack traces to remove sensitive file paths
function sanitizeStackTrace(stack: string): string {
  if (!stack) return '';
  return stack
    .split('\n')
    .map(line => {
      // Remove full file paths, keep only filename and line numbers
      return line.replace(/\(\/.*\/([^/]+\.[tj]sx?:\d+:\d+)\)/g, '($1)')
                 .replace(/at \/.*\/([^/]+\.[tj]sx?:\d+:\d+)/g, 'at $1');
    })
    .join('\n');
}

// Validate URL to prevent javascript: and other dangerous protocols
function isValidUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

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

    // Sanitize all user inputs before including in email
    const safeUserEmail = escapeHtml(userEmail || 'Not provided');
    const safeUrl = isValidUrl(url) ? escapeHtml(url) : 'Invalid URL';
    const safeUserAgent = escapeHtml(userAgent || 'Unknown');
    const safeDescription = escapeHtml(description || '').replace(/\n/g, '<br>');
    const safeErrorMessage = escapeHtml(errorMessage || 'No error message');
    const safeErrorStack = errorStack ? escapeHtml(sanitizeStackTrace(errorStack)) : '';

    // Format email content with sanitized inputs
    const emailHtml = `
      <h2>🐛 New Bug Report</h2>

      <h3>User Information</h3>
      <p><strong>Email:</strong> ${safeUserEmail}</p>
      <p><strong>URL:</strong> ${isValidUrl(url) ? `<a href="${safeUrl}">${safeUrl}</a>` : safeUrl}</p>
      <p><strong>User Agent:</strong> ${safeUserAgent}</p>

      <h3>User Description</h3>
      <p>${safeDescription}</p>

      <h3>Error Message</h3>
      <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto;">${safeErrorMessage}</pre>

      ${safeErrorStack ? `
        <h3>Stack Trace (Sanitized)</h3>
        <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; max-height: 400px; overflow-y: auto;">${safeErrorStack}</pre>
      ` : ''}

      <hr>
      <p style="color: #666; font-size: 12px;">Sent from ArcAI Bug Report System</p>
    `;

    // Plain text version (also sanitized for consistency)
    const emailText = `
New Bug Report

User Email: ${userEmail || 'Not provided'}
URL: ${isValidUrl(url) ? url : 'Invalid URL'}

User Description:
${description || 'No description'}

Error Message:
${errorMessage || 'No error message'}

${errorStack ? `Stack Trace (Sanitized):\n${sanitizeStackTrace(errorStack)}` : ''}
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
  } catch (error: unknown) {
    console.error('Error in send-bug-report function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
