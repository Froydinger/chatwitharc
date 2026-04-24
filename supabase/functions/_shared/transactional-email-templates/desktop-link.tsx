/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ArcAI'
const DEFAULT_DESKTOP_URL = 'https://askarc.chat/'

interface DesktopLinkProps {
  displayName?: string
  desktopUrl?: string
}

const DesktopLinkEmail = ({ displayName, desktopUrl }: DesktopLinkProps) => {
  const name = displayName || 'there'
  const href = desktopUrl || DEFAULT_DESKTOP_URL

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Your desktop link for {SITE_NAME}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src="https://jxywhodnndagbsmnbnnw.supabase.co/storage/v1/object/public/email-assets/arc-logo-ui.png"
              width="56"
              height="56"
              alt="ArcAI"
              style={logo}
            />
          </Section>

          <Section style={content}>
            <Text style={emoji}>🖥️</Text>
            <Heading style={h1}>Your desktop link is ready, {name}</Heading>
            <Text style={paragraph}>
              Open Arc on desktop where local mode is more stable and gives you the full experience.
              Sign in with this same email to pick up where you left off.
            </Text>

            <Section style={ctaWrap}>
              <Button style={button} href={href}>
                Open Arc on desktop
              </Button>
            </Section>

            <Text style={note}>
              Best results: Arc, Chrome, Edge, or Brave on desktop.
            </Text>
          </Section>

          <Section style={footer}>
            <Text style={footerText}>Sent from {SITE_NAME} by Win The Night</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: DesktopLinkEmail,
  subject: '🖥️ Your Arc desktop link',
  displayName: 'Desktop link',
  previewData: { displayName: 'Jane', desktopUrl: DEFAULT_DESKTOP_URL },
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
  textAlign: 'center' as const,
}
const emoji = { fontSize: '48px', textAlign: 'center' as const, margin: '0 0 16px' }
const h1 = {
  color: '#0f172a',
  fontSize: '28px',
  fontWeight: '700' as const,
  textAlign: 'center' as const,
  margin: '0 0 16px',
}
const paragraph = {
  color: '#475569',
  fontSize: '15px',
  lineHeight: '26px',
  textAlign: 'center' as const,
  margin: '0 0 28px',
}
const ctaWrap = { textAlign: 'center' as const, margin: '0 0 20px' }
const button = {
  backgroundColor: '#0080f0',
  borderRadius: '10px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600' as const,
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 36px',
}
const note = { color: '#64748b', fontSize: '13px', lineHeight: '20px', margin: '0' }
const footer = { padding: '28px 20px', textAlign: 'center' as const }
const footerText = { color: '#94a3b8', fontSize: '11px', margin: '0' }