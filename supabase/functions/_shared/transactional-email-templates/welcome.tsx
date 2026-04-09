/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Section, Text, Button, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ArcAI'

interface WelcomeEmailProps {
  displayName?: string
}

const WelcomeEmail = ({ displayName }: WelcomeEmailProps) => {
  const name = displayName || 'there'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Welcome to {SITE_NAME} — your AI journey starts now ✨</Preview>
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
            <Text style={emoji}>🎉</Text>
            <Heading style={h1}>Welcome, {name}!</Heading>
            <Text style={paragraph}>
              Your account is all set up. You're now part of a growing community
              of creators, developers, and thinkers using AI to do amazing things.
            </Text>

            <Section style={ctaWrap}>
              <Button style={button} href="https://askarc.chat">
                Start Chatting
              </Button>
            </Section>

            <Hr style={hr} />

            <Text style={tipsHeading}>Quick tips to get started:</Text>

            <Section style={tipRow}>
              <Text style={tipIcon}>💡</Text>
              <Section>
                <Text style={tipTitle}>Just ask naturally</Text>
                <Text style={tipDesc}>Type or speak like you're talking to a friend</Text>
              </Section>
            </Section>

            <Section style={tipRow}>
              <Text style={tipIcon}>🎨</Text>
              <Section>
                <Text style={tipTitle}>Generate images</Text>
                <Text style={tipDesc}>Use /image or tap the image button to create visuals</Text>
              </Section>
            </Section>

            <Section style={tipRow}>
              <Text style={tipIcon}>🔍</Text>
              <Section>
                <Text style={tipTitle}>Research anything</Text>
                <Text style={tipDesc}>Use /search for real-time web information</Text>
              </Section>
            </Section>

            <Section style={tipRow}>
              <Text style={tipIcon}>✍️</Text>
              <Section>
                <Text style={tipTitle}>Write & code</Text>
                <Text style={tipDesc}>Use /write or /code for canvas mode</Text>
              </Section>
            </Section>
          </Section>

          <Section style={upgradeCard}>
            <Text style={emoji}>⚡</Text>
            <Heading style={h2}>Unlock the full experience</Heading>
            <Text style={upgradeParagraph}>
              Upgrade to ArcAI Pro for unlimited messages, voice mode, image generation, music player, and more.
            </Text>
            <Button style={upgradeButton} href="https://askarc.chat/?upgrade=true">
              ✨ Upgrade to Pro
            </Button>
          </Section>

          <Section style={footer}>
            <Text style={footerText}>Need help? Just ask ArcAI anything!</Text>
            <Text style={copy}>© 2026 ArcAI by Win The Night Productions</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: WelcomeEmail,
  subject: '🎉 Welcome to ArcAI — Your AI journey begins!',
  displayName: 'Welcome email',
  previewData: { displayName: 'Jane' },
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
const ctaWrap = { textAlign: 'center' as const, margin: '0 0 28px' }
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
const hr = { borderColor: '#e2e8f0', margin: '0 0 24px' }
const tipsHeading = { color: '#475569', fontSize: '14px', fontWeight: '500' as const, margin: '0 0 20px' }
const tipRow = { marginBottom: '16px' }
const tipIcon = { fontSize: '20px', margin: '0 0 4px' }
const tipTitle = { color: '#0f172a', fontSize: '14px', fontWeight: '600' as const, margin: '0 0 2px' }
const tipDesc = { color: '#94a3b8', fontSize: '13px', margin: '0' }
const upgradeCard = {
  backgroundColor: '#f1f5f9',
  margin: '16px 0 0',
  padding: '28px 24px',
  borderRadius: '16px',
  border: '1px solid #e2e8f0',
  textAlign: 'center' as const,
}
const h2 = { color: '#0f172a', fontSize: '20px', fontWeight: '700' as const, margin: '0 0 8px' }
const upgradeParagraph = { color: '#475569', fontSize: '14px', lineHeight: '22px', margin: '0 0 20px' }
const upgradeButton = {
  backgroundColor: '#7c3aed',
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
