/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface BoostGrantedProps {
  displayName?: string
  adminEmail?: string
  appUrl?: string
}

const BoostGrantedEmail = ({
  displayName,
  adminEmail,
  appUrl = 'https://askarc.chat',
}: BoostGrantedProps) => {
  const name = displayName || 'there'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>ArcAI Boost has been added to your account.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img src="https://askarc.chat/arc-logo-ui.png" width="56" height="56" alt="ArcAI" style={logo} />
          </Section>
          <Section style={content}>
            <Text style={eyebrow}>Boost granted</Text>
            <Heading style={h1}>Boost is active, {name}.</Heading>
            <Text style={paragraph}>
              ArcAI Boost has been granted to your account{adminEmail ? ` by ${adminEmail}` : ''}. You now have access to Boost features, including Sol frontier reasoning, expanded image limits, voice conversations, and publishing tools.
            </Text>
            <Section style={ctaWrap}>
              <Button style={button} href={appUrl}>Open ArcAI</Button>
            </Section>
          </Section>
          <Section style={footer}>
            <Text style={copy}>© 2026 ArcAI by Win The Night Foundation</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: BoostGrantedEmail,
  subject: 'ArcAI Boost has been added to your account',
  displayName: 'Boost granted by admin',
  previewData: { displayName: 'Jane', adminEmail: 'admin@askarc.chat', appUrl: 'https://askarc.chat' },
} satisfies TemplateEntry

const main = { backgroundColor: '#09090b', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }
const container = { margin: '0 auto', padding: '40px 0', maxWidth: '560px' }
const header = { textAlign: 'center' as const, paddingBottom: '24px' }
const logo = { margin: '0 auto', borderRadius: '14px' }
const content = { backgroundColor: '#18181b', borderRadius: '16px', padding: '40px 32px', border: '1px solid rgba(34, 197, 94, 0.28)' }
const eyebrow = { color: '#4ade80', fontSize: '13px', fontWeight: '700' as const, letterSpacing: '0.08em', textTransform: 'uppercase' as const, textAlign: 'center' as const, margin: '0 0 12px' }
const h1 = { color: '#fafafa', fontSize: '28px', fontWeight: '700' as const, textAlign: 'center' as const, margin: '0 0 16px' }
const paragraph = { color: '#a1a1aa', fontSize: '15px', lineHeight: '26px', textAlign: 'center' as const, margin: '0 0 28px' }
const ctaWrap = { textAlign: 'center' as const, margin: '0' }
const button = { backgroundColor: '#16a34a', borderRadius: '10px', color: '#ffffff', fontSize: '16px', fontWeight: '600' as const, textDecoration: 'none', textAlign: 'center' as const, display: 'inline-block', padding: '14px 36px', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)' }
const footer = { padding: '28px 20px', textAlign: 'center' as const }
const copy = { color: '#52525b', fontSize: '11px', margin: '0' }
