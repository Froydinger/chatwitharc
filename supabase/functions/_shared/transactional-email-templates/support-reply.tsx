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
  isEmailGuest?: boolean
}

const SupportReplyEmail = ({ subject, messagePreview, isEmailGuest }: SupportReplyProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{isEmailGuest ? `Support Reply: ${subject}` : `New reply on your support ticket — ${subject || 'Your ticket'}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Img
            src="https://askarc.chat/arc-logo-ui.png"
            width="48"
            height="48"
            alt="ArcAI"
            style={logo}
          />
        </Section>

        <Section style={content}>
          <Text style={emoji}>💬</Text>
          <Heading style={h1}>{isEmailGuest ? 'Message from Arc Support' : 'New reply on your ticket'}</Heading>
          <Text style={subjectLine}>
            <strong>Subject:</strong> {subject || 'Support ticket'}
          </Text>

          {messagePreview && (
            <Section style={previewBox}>
              <Text style={previewText}>{messagePreview}</Text>
            </Section>
          )}

          {!isEmailGuest ? (
            <Section style={ctaWrap}>
              <Button style={button} href="https://askarc.chat/support">
                View Conversation
              </Button>
            </Section>
          ) : (
            <Text style={{ ...subjectLine, margin: '20px 0 0', fontStyle: 'italic', fontSize: '13px' }}>
              Reply directly to this email to continue the conversation.
            </Text>
          )}
        </Section>

        <Section style={footer}>
          <Text style={footerText}>
            {isEmailGuest 
              ? "You're receiving this because you contacted support at hello@askarc.chat."
              : "You're receiving this because you have an open support ticket."}
          </Text>
          <Text style={copy}>© 2026 ArcAI by Win The Night™ Foundation</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SupportReplyEmail,
  subject: (data: Record<string, any>) => `Reply on your ticket: ${data.subject || 'Support'}`,
  displayName: 'Support ticket reply',
  previewData: { subject: 'Login issue', messagePreview: 'Hey! I looked into this and it should be fixed now. Let me know if it happens again.', isEmailGuest: false },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#09090b',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}
const container = { margin: '0 auto', padding: '40px 0', maxWidth: '560px' }
const header = { textAlign: 'center' as const, paddingBottom: '24px' }
const logo = { margin: '0 auto', borderRadius: '14px' }
const content = {
  backgroundColor: '#18181b',
  borderRadius: '16px',
  padding: '40px 32px',
  border: '1px solid rgba(0, 128, 240, 0.25)',
}
const emoji = { fontSize: '40px', textAlign: 'center' as const, margin: '0 0 12px' }
const h1 = {
  color: '#fafafa',
  fontSize: '24px',
  fontWeight: '700' as const,
  textAlign: 'center' as const,
  margin: '0 0 16px',
}
const subjectLine = {
  color: '#a1a1aa',
  fontSize: '14px',
  lineHeight: '22px',
  textAlign: 'center' as const,
  margin: '0 0 20px',
}
const previewBox = {
  backgroundColor: '#09090b',
  borderRadius: '10px',
  padding: '16px 20px',
  border: '1px solid rgba(0, 128, 240, 0.15)',
  margin: '0 0 24px',
}
const previewText = {
  color: '#fafafa',
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
  boxShadow: '0 4px 12px rgba(0, 128, 240, 0.3)',
}
const footer = { padding: '28px 20px', textAlign: 'center' as const }
const footerText = { color: '#71717a', fontSize: '13px', margin: '0 0 12px' }
const copy = { color: '#52525b', fontSize: '11px', margin: '0' }
