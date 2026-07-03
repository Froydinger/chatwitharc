/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ArcAI'

interface SharedChatInviteProps {
  inviterName?: string
  chatTitle?: string
  chatUrl?: string
  isExistingUser?: boolean
}

const SharedChatInviteEmail = ({
  inviterName = 'Someone',
  chatTitle = 'a shared chat',
  chatUrl = 'https://askarc.chat/shared',
  isExistingUser = true,
}: SharedChatInviteProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{inviterName} invited you to "{chatTitle}" on {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Img
            src="https://cgvixgyjzswebosfqyll.supabase.co/storage/v1/object/public/email-assets/arc-logo-ui.png"
            width="56" height="56" alt="ArcAI" style={logo}
          />
        </Section>
        <Section style={content}>
          <Text style={emoji}>💬</Text>
          <Heading style={h1}>You're invited to a shared chat</Heading>
          <Text style={paragraph}>
            <strong>{inviterName}</strong> added you to <strong>"{chatTitle}"</strong> on {SITE_NAME}.
            Jump in to collaborate with the group — and mention <code>@arc</code> to bring Arc into the conversation.
          </Text>
          <Section style={ctaWrap}>
            <Button style={button} href={chatUrl}>Open shared chat</Button>
          </Section>
          {!isExistingUser && (
            <>
              <Hr style={hr} />
              <Text style={tipDesc}>
                You'll need to sign up with this email address to access the chat. It's free and takes a minute.
              </Text>
            </>
          )}
        </Section>
        <Section style={footer}>
          <Text style={copy}>© 2026 ArcAI by Win The Night Productions</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SharedChatInviteEmail,
  subject: (d: Record<string, any>) =>
    `${d?.inviterName ?? 'Someone'} invited you to "${d?.chatTitle ?? 'a shared chat'}" on ArcAI`,
  displayName: 'Shared chat invite',
  previewData: { inviterName: 'Jordan', chatTitle: 'Trip planning', chatUrl: 'https://askarc.chat/shared/abc', isExistingUser: true },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }
const container = { margin: '0 auto', padding: '40px 0', maxWidth: '560px' }
const header = { textAlign: 'center' as const, paddingBottom: '24px' }
const logo = { margin: '0 auto', borderRadius: '14px' }
const content = { backgroundColor: '#f8fafc', borderRadius: '16px', padding: '40px 32px', border: '1px solid #e2e8f0' }
const emoji = { fontSize: '48px', textAlign: 'center' as const, margin: '0 0 16px' }
const h1 = { color: '#0f172a', fontSize: '26px', fontWeight: '700' as const, textAlign: 'center' as const, margin: '0 0 16px' }
const paragraph = { color: '#475569', fontSize: '15px', lineHeight: '26px', textAlign: 'center' as const, margin: '0 0 28px' }
const ctaWrap = { textAlign: 'center' as const, margin: '0 0 12px' }
const button = { backgroundColor: '#0080f0', borderRadius: '10px', color: '#ffffff', fontSize: '16px', fontWeight: '600' as const, textDecoration: 'none', textAlign: 'center' as const, display: 'inline-block', padding: '14px 36px' }
const hr = { borderColor: '#e2e8f0', margin: '20px 0' }
const tipDesc = { color: '#64748b', fontSize: '13px', textAlign: 'center' as const, margin: '0' }
const footer = { padding: '28px 20px', textAlign: 'center' as const }
const copy = { color: '#94a3b8', fontSize: '11px', margin: '0' }
