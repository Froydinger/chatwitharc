/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ArcAI'

interface ArcNotificationProps {
  title?: string
  message?: string
  url?: string
  ctaLabel?: string
}

const ArcNotificationEmail = ({
  title = 'A note from Arc',
  message = '',
  url,
  ctaLabel = 'Open ArcAI',
}: ArcNotificationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{title}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Img
            src="https://askarc.chat/arc-logo-ui.png"
            width="56" height="56" alt="ArcAI" style={logo}
          />
        </Section>
        <Section style={content}>
          <Heading style={h1}>{title}</Heading>
          {message && <Text style={paragraph}>{message}</Text>}
          {url && (
            <Section style={ctaWrap}>
              <Button style={button} href={url}>{ctaLabel}</Button>
            </Section>
          )}
        </Section>
        <Section style={footer}>
          <Text style={copy}>© 2026 {SITE_NAME} by Win The Night™ Foundation</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ArcNotificationEmail,
  subject: (d: Record<string, any>) => d?.title ?? 'A note from Arc',
  displayName: 'Arc notification',
  previewData: { title: 'Here\'s your reminder', message: 'You asked me to ping you at 3pm.', url: 'https://askarc.chat', ctaLabel: 'Open ArcAI' },
} satisfies TemplateEntry

const main = { backgroundColor: '#09090b', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }
const container = { margin: '0 auto', padding: '40px 0', maxWidth: '560px' }
const header = { textAlign: 'center' as const, paddingBottom: '24px' }
const logo = { margin: '0 auto', borderRadius: '14px' }
const content = { backgroundColor: '#18181b', borderRadius: '16px', padding: '40px 32px', border: '1px solid rgba(0, 128, 240, 0.25)' }
const h1 = { color: '#fafafa', fontSize: '22px', fontWeight: '700' as const, textAlign: 'center' as const, margin: '0 0 16px' }
const paragraph = { color: '#a1a1aa', fontSize: '15px', lineHeight: '26px', textAlign: 'center' as const, margin: '0 0 24px', whiteSpace: 'pre-wrap' as const }
const ctaWrap = { textAlign: 'center' as const, margin: '0 0 8px' }
const button = { backgroundColor: '#0080f0', borderRadius: '10px', color: '#ffffff', fontSize: '16px', fontWeight: '600' as const, textDecoration: 'none', textAlign: 'center' as const, display: 'inline-block', padding: '14px 36px', boxShadow: '0 4px 12px rgba(0, 128, 240, 0.3)' }
const footer = { padding: '28px 20px', textAlign: 'center' as const }
const copy = { color: '#52525b', fontSize: '11px', margin: '0' }
