/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Section, Text, Button, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ArcAI'

interface SupportReplyProps {
  subject?: string
  messagePreview?: string
}

const SupportReplyEmail = ({ subject, messagePreview }: SupportReplyProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New reply on your support ticket — {subject || 'Your ticket'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Img
            src="https://jxywhodnndagbsmnbnnw.supabase.co/storage/v1/object/public/email-assets/arc-logo-ui.png"
            width="48"
            height="48"
            alt="ArcAI"
            style={logo}
          />
        </Section>

        <Section style={content}>
          <Text style={emoji}>💬</Text>
          <Heading style={h1}>New reply on your ticket</Heading>
          <Text style={subjectLine}>
            <strong>Subject:</strong> {subject || 'Support ticket'}
          </Text>

          {messagePreview && (
            <Section style={previewBox}>
              <Text style={previewText}>{messagePreview}</Text>
            </Section>
          )}

          <Section style={ctaWrap}>
            <Button style={button} href="https://askarc.chat/support">
              View Conversation
            </Button>
          </Section>
        </Section>

        <Section style={footer}>
          <Text style={footerText}>You're receiving this because you have an open support ticket.</Text>
          <Text style={copy}>© 2026 ArcAI by Win The Night Productions</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SupportReplyEmail,
  subject: (data: Record<string, any>) => `Reply on your ticket: ${data.subject || 'Support'}`,
  displayName: 'Support ticket reply',
  previewData: { subject: 'Login issue', messagePreview: 'Hey! I looked into this and it should be fixed now. Let me know if it happens again.' },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}
const container = { margin: '0 auto', padding: '40px 0', maxWidth: '560px' }
const header = { textAlign: 'center' as const, paddingBottom: '24px' }
const logo = { margin: '0 auto', borderRadius: '14px' }
const content = {
  backgroundColor: '#f8fafc',
  borderRadius: '16px',
  padding: '40px 32px',
  border: '1px solid #e2e8f0',
}
const emoji = { fontSize: '40px', textAlign: 'center' as const, margin: '0 0 12px' }
const h1 = {
  color: '#0f172a',
  fontSize: '24px',
  fontWeight: '700' as const,
  textAlign: 'center' as const,
  margin: '0 0 16px',
}
const subjectLine = {
  color: '#475569',
  fontSize: '14px',
  lineHeight: '22px',
  textAlign: 'center' as const,
  margin: '0 0 20px',
}
const previewBox = {
  backgroundColor: '#ffffff',
  borderRadius: '10px',
  padding: '16px 20px',
  border: '1px solid #e2e8f0',
  margin: '0 0 24px',
}
const previewText = {
  color: '#334155',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
  fontStyle: 'italic' as const,
}
const ctaWrap = { textAlign: 'center' as const, margin: '0' }
const button = {
  backgroundColor: '#0080f0',
  borderRadius: '10px',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '600' as const,
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 32px',
}
const footer = { padding: '28px 20px', textAlign: 'center' as const }
const footerText = { color: '#64748b', fontSize: '13px', margin: '0 0 12px' }
const copy = { color: '#94a3b8', fontSize: '11px', margin: '0' }
