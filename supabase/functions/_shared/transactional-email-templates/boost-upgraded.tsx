/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface BoostUpgradedProps {
  displayName?: string
  planName?: string
  appUrl?: string
  manageUrl?: string
}

const BoostUpgradedEmail = ({
  displayName,
  planName = 'ArcAI Boost',
  appUrl = 'https://askarc.chat',
  manageUrl = 'https://askarc.chat/dashboard/settings?section=plan',
}: BoostUpgradedProps) => {
  const name = displayName || 'there'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Your {planName} upgrade is active.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img src="https://askarc.chat/arc-logo-ui.png" width="56" height="56" alt="ArcAI" style={logo} />
          </Section>
          <Section style={content}>
            <Text style={eyebrow}>Boost activated</Text>
            <Heading style={h1}>You're upgraded, {name}.</Heading>
            <Text style={paragraph}>
              Thanks for upgrading to {planName}. Your Boost access is active now, including Sol frontier reasoning, higher image limits, voice conversations, and publishing tools.
            </Text>
            <Section style={ctaWrap}>
              <Button style={button} href={appUrl}>Open ArcAI</Button>
            </Section>
            <Text style={small}>
              You can manage your plan anytime from account settings.
            </Text>
            <Section style={secondaryCtaWrap}>
              <Button style={secondaryButton} href={manageUrl}>Manage plan</Button>
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
  component: BoostUpgradedEmail,
  subject: 'Your ArcAI Boost upgrade is active',
  displayName: 'Boost upgrade confirmation',
  previewData: { displayName: 'Jake', planName: 'ArcAI Boost', appUrl: 'https://askarc.chat', manageUrl: 'https://askarc.chat/dashboard/settings?section=plan' },
} satisfies TemplateEntry

const main = { backgroundColor: '#09090b', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }
const container = { margin: '0 auto', padding: '40px 0', maxWidth: '560px' }
const header = { textAlign: 'center' as const, paddingBottom: '24px' }
const logo = { margin: '0 auto', borderRadius: '14px' }
const content = { backgroundColor: '#18181b', borderRadius: '16px', padding: '40px 32px', border: '1px solid rgba(0, 128, 240, 0.25)' }
const eyebrow = { color: '#38bdf8', fontSize: '13px', fontWeight: '700' as const, letterSpacing: '0.08em', textTransform: 'uppercase' as const, textAlign: 'center' as const, margin: '0 0 12px' }
const h1 = { color: '#fafafa', fontSize: '28px', fontWeight: '700' as const, textAlign: 'center' as const, margin: '0 0 16px' }
const paragraph = { color: '#a1a1aa', fontSize: '15px', lineHeight: '26px', textAlign: 'center' as const, margin: '0 0 28px' }
const ctaWrap = { textAlign: 'center' as const, margin: '0 0 16px' }
const button = { backgroundColor: '#0080f0', borderRadius: '10px', color: '#ffffff', fontSize: '16px', fontWeight: '600' as const, textDecoration: 'none', textAlign: 'center' as const, display: 'inline-block', padding: '14px 36px', boxShadow: '0 4px 12px rgba(0, 128, 240, 0.3)' }
const small = { color: '#71717a', fontSize: '13px', lineHeight: '22px', textAlign: 'center' as const, margin: '8px 0 12px' }
const secondaryCtaWrap = { textAlign: 'center' as const, margin: '0' }
const secondaryButton = { backgroundColor: '#27272a', borderRadius: '10px', color: '#fafafa', fontSize: '14px', fontWeight: '600' as const, textDecoration: 'none', textAlign: 'center' as const, display: 'inline-block', padding: '12px 24px' }
const footer = { padding: '28px 20px', textAlign: 'center' as const }
const copy = { color: '#52525b', fontSize: '11px', margin: '0' }
