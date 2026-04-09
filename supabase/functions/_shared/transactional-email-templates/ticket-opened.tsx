/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Section, Text, Button, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ArcAI'

interface TicketOpenedProps {
  subject?: string
  userEmail?: string
  userName?: string
  priority?: string
}

const TicketOpenedEmail = ({ subject, userEmail, userName, priority }: TicketOpenedProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>🎫 New support ticket: {subject || 'No subject'}</Preview>
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
          <Text style={emoji}>🎫</Text>
          <Heading style={h1}>New Support Ticket</Heading>

          <Text style={label}>Subject</Text>
          <Text style={value}>{subject || 'No subject'}</Text>

          <Text style={label}>From</Text>
          <Text style={value}>{userName || 'Unknown'} ({userEmail || 'No email'})</Text>

          <Text style={label}>Priority</Text>
          <Text style={value}>{(priority || 'normal').toUpperCase()}</Text>

          <Hr style={hr} />

          <Section style={ctaWrap}>
            <Button style={button} href="https://askarc.chat/support">
              View in Dashboard
            </Button>
          </Section>
        </Section>

        <Section style={footer}>
          <Text style={footerText}>{SITE_NAME} Support System</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TicketOpenedEmail,
  subject: (data: Record<string, any>) => `🎫 New ticket: ${data.subject || 'Support request'}`,
  displayName: 'Ticket opened (admin notification)',
  to: Deno.env.get('ADMIN_EMAIL') || undefined,
  previewData: { subject: 'Login not working', userEmail: 'user@example.com', userName: 'Jake', priority: 'normal' },
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
const h1 = { color: '#0f172a', fontSize: '24px', fontWeight: '700' as const, textAlign: 'center' as const, margin: '0 0 24px' }
const label = { color: '#64748b', fontSize: '12px', fontWeight: '600' as const, textTransform: 'uppercase' as const, margin: '0 0 4px', letterSpacing: '0.05em' }
const value = { color: '#0f172a', fontSize: '14px', margin: '0 0 16px', lineHeight: '22px' }
const hr = { borderColor: '#e2e8f0', margin: '8px 0 20px' }
const ctaWrap = { textAlign: 'center' as const }
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
const footerText = { color: '#94a3b8', fontSize: '11px', margin: '0' }
