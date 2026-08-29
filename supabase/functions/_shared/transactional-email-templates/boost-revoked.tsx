/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailHead, ARC_EMAIL_BODY_PROPS } from '../email-theme.tsx'

interface BoostRevokedProps {
  displayName?: string
  adminEmail?: string
  appUrl?: string
  pricingUrl?: string
}

const BoostRevokedEmail = ({
  displayName,
  adminEmail,
  appUrl = 'https://askarc.chat/support',
  pricingUrl = 'https://askarc.chat/pricing',
}: BoostRevokedProps) => {
  const name = displayName || 'there'
  return (
    <Html lang="en" dir="ltr">
      <EmailHead />
      <Preview>ArcAI Boost has been removed from your account.</Preview>
      <Body {...ARC_EMAIL_BODY_PROPS} style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img src="https://askarc.chat/arc-logo-ui.png" width="56" height="56" alt="ArcAI" style={logo} />
          </Section>
          <Section style={content}>
            <Text style={eyebrow}>Boost removed</Text>
            <Heading style={h1}>Your account is back on the free plan, {name}.</Heading>
            <Text style={paragraph}>
              ArcAI Boost access has been removed from your account{adminEmail ? ` by ${adminEmail}` : ''}. You can keep using ArcAI on the free plan, and you can upgrade again whenever you need Boost features.
            </Text>
            <Section style={ctaWrap}>
              <Button style={button} href={pricingUrl}>View plans</Button>
            </Section>
            <Text style={small}>
              If this change looks wrong, contact ArcAI Support.
            </Text>
            <Section style={secondaryCtaWrap}>
              <Button style={secondaryButton} href={appUrl}>Contact support</Button>
            </Section>
          </Section>
          <Section style={footer}>
            <Text style={copy}>© 2026 ArcAI by Win The Night™ Foundation</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: BoostRevokedEmail,
  subject: 'ArcAI Boost has been removed from your account',
  displayName: 'Boost revoked by admin',
  previewData: { displayName: 'Jane', adminEmail: 'admin@askarc.chat', appUrl: 'https://askarc.chat/support', pricingUrl: 'https://askarc.chat/pricing' },
} satisfies TemplateEntry

const main = { backgroundColor: '#09090b', backgroundImage: 'linear-gradient(#09090b, #09090b)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }
const container = { margin: '0 auto', padding: '40px 0', maxWidth: '560px' }
const header = { textAlign: 'center' as const, paddingBottom: '24px' }
const logo = { margin: '0 auto', borderRadius: '14px', backgroundColor: '#000000', backgroundImage: 'linear-gradient(#000000, #000000)', padding: '8px' }
const content = { backgroundColor: '#18181b', backgroundImage: 'linear-gradient(#18181b, #18181b)', borderRadius: '16px', padding: '40px 32px', border: '1px solid rgba(244, 63, 94, 0.28)' }
const eyebrow = { color: '#fb7185', fontSize: '13px', fontWeight: '700' as const, letterSpacing: '0.08em', textTransform: 'uppercase' as const, textAlign: 'center' as const, margin: '0 0 12px' }
const h1 = { color: '#fafafa', fontSize: '26px', fontWeight: '700' as const, textAlign: 'center' as const, margin: '0 0 16px' }
const paragraph = { color: '#a1a1aa', fontSize: '15px', lineHeight: '26px', textAlign: 'center' as const, margin: '0 0 28px' }
const ctaWrap = { textAlign: 'center' as const, margin: '0 0 16px' }
const button = { backgroundColor: '#e11d48', backgroundImage: 'linear-gradient(#e11d48, #e11d48)', borderRadius: '10px', color: '#ffffff', fontSize: '16px', fontWeight: '600' as const, textDecoration: 'none', textAlign: 'center' as const, display: 'inline-block', padding: '14px 36px', boxShadow: '0 4px 12px rgba(225, 29, 72, 0.25)' }
const small = { color: '#71717a', fontSize: '13px', lineHeight: '22px', textAlign: 'center' as const, margin: '8px 0 12px' }
const secondaryCtaWrap = { textAlign: 'center' as const, margin: '0' }
const secondaryButton = { backgroundColor: '#27272a', backgroundImage: 'linear-gradient(#27272a, #27272a)', borderRadius: '10px', color: '#fafafa', fontSize: '14px', fontWeight: '600' as const, textDecoration: 'none', textAlign: 'center' as const, display: 'inline-block', padding: '12px 24px' }
const footer = { padding: '28px 20px', textAlign: 'center' as const }
const copy = { color: '#52525b', fontSize: '11px', margin: '0' }
