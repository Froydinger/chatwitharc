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
            src="https://askarc.chat/arc-logo-ui.png"
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
          <Text style={footerText}>ArcAI Bug Report System by Win The Night™ Foundation</Text>
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
  backgroundColor: '#09090b',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}
const container = { margin: '0 auto', padding: '40px 0', maxWidth: '560px' }
const header = { textAlign: 'center' as const, paddingBottom: '16px' }
const logo = { margin: '0 auto', borderRadius: '10px' }
const content = {
  backgroundColor: '#18181b',
  borderRadius: '12px',
  padding: '32px 28px',
  border: '1px solid rgba(0, 128, 240, 0.25)',
}
const h1 = { color: '#fafafa', fontSize: '22px', fontWeight: '700' as const, margin: '0 0 24px' }
const label = { color: '#71717a', fontSize: '12px', fontWeight: '600' as const, textTransform: 'uppercase' as const, margin: '0 0 4px', letterSpacing: '0.05em' }
const value = { color: '#fafafa', fontSize: '14px', margin: '0 0 16px', lineHeight: '22px' }
const hr = { borderColor: '#27272a', margin: '8px 0 16px' }
const codeBox = {
  backgroundColor: '#09090b',
  border: '1px solid rgba(0, 128, 240, 0.15)',
  borderRadius: '8px',
  padding: '12px 16px',
  marginBottom: '16px',
}
const codeText = {
  color: '#fafafa',
  fontSize: '13px',
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Courier, monospace',
  margin: '0',
  lineHeight: '20px',
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-all' as const,
}
const footer = { padding: '20px', textAlign: 'center' as const }
const footerText = { color: '#52525b', fontSize: '11px', margin: '0' }
