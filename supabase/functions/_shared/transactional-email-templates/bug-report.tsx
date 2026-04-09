/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface BugReportEmailProps {
  userEmail?: string
  description?: string
  errorMessage?: string
  errorStack?: string
  url?: string
  userAgent?: string
}

const BugReportEmail = ({
  userEmail,
  description,
  errorMessage,
  errorStack,
  url,
  userAgent,
}: BugReportEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>🐛 Bug Report: {errorMessage?.substring(0, 60) || 'New report'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Img
            src="https://jxywhodnndagbsmnbnnw.supabase.co/storage/v1/object/public/email-assets/arc-logo-ui.png"
            width="40"
            height="40"
            alt="ArcAI"
            style={logo}
          />
        </Section>

        <Section style={content}>
          <Heading style={h1}>🐛 New Bug Report</Heading>

          <Text style={label}>From</Text>
          <Text style={value}>{userEmail || 'Not provided'}</Text>

          <Text style={label}>URL</Text>
          <Text style={value}>{url || 'Not provided'}</Text>

          <Text style={label}>User Agent</Text>
          <Text style={value}>{userAgent || 'Unknown'}</Text>

          <Hr style={hr} />

          <Text style={label}>Description</Text>
          <Text style={value}>{description || 'No description provided'}</Text>

          <Text style={label}>Error Message</Text>
          <Section style={codeBox}>
            <Text style={codeText}>{errorMessage || 'No error message'}</Text>
          </Section>

          {errorStack ? (
            <>
              <Text style={label}>Stack Trace</Text>
              <Section style={codeBox}>
                <Text style={codeText}>{errorStack}</Text>
              </Section>
            </>
          ) : null}
        </Section>

        <Section style={footer}>
          <Text style={footerText}>ArcAI Bug Report System</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BugReportEmail,
  subject: (data: Record<string, any>) =>
    `🐛 Bug Report: ${(data.errorMessage || 'New report').substring(0, 50)}`,
  displayName: 'Bug report notification',
  to: Deno.env.get('ADMIN_EMAIL') || undefined,
  previewData: {
    userEmail: 'user@example.com',
    description: 'The chat input freezes after sending a message',
    errorMessage: 'TypeError: Cannot read properties of undefined',
    url: 'https://askarc.chat/',
    userAgent: 'Mozilla/5.0',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}
const container = { margin: '0 auto', padding: '40px 0', maxWidth: '560px' }
const header = { textAlign: 'center' as const, paddingBottom: '16px' }
const logo = { margin: '0 auto', borderRadius: '10px' }
const content = {
  backgroundColor: '#f8fafc',
  borderRadius: '12px',
  padding: '32px 28px',
  border: '1px solid #e2e8f0',
}
const h1 = { color: '#0f172a', fontSize: '22px', fontWeight: '700' as const, margin: '0 0 24px' }
const label = { color: '#64748b', fontSize: '12px', fontWeight: '600' as const, textTransform: 'uppercase' as const, margin: '0 0 4px', letterSpacing: '0.05em' }
const value = { color: '#0f172a', fontSize: '14px', margin: '0 0 16px', lineHeight: '22px' }
const hr = { borderColor: '#e2e8f0', margin: '8px 0 16px' }
const codeBox = {
  backgroundColor: '#f1f5f9',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '12px 16px',
  marginBottom: '16px',
}
const codeText = {
  color: '#334155',
  fontSize: '13px',
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Courier, monospace',
  margin: '0',
  lineHeight: '20px',
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-all' as const,
}
const footer = { padding: '20px', textAlign: 'center' as const }
const footerText = { color: '#94a3b8', fontSize: '11px', margin: '0' }
