/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
  Hr,
} from 'npm:@react-email/components@0.0.22'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your ArcAI login link is ready 🔑</Preview>
    <Body style={main}>
      <Container style={outerContainer}>
        <Section style={card}>
          <Section style={logoSection}>
            <Img
              src="https://jxywhodnndagbsmnbnnw.supabase.co/storage/v1/object/public/email-assets/arc-logo-ui.png"
              width="56"
              height="56"
              alt="ArcAI"
              style={logo}
            />
          </Section>

          <Text style={emoji}>🔑</Text>
          <Heading style={h1}>Sign in to ArcAI</Heading>

          <Text style={text}>
            Click below to securely access your account. This link will expire shortly.
          </Text>

          <Section style={buttonContainer}>
            <Button style={primaryButton} href={confirmationUrl}>
              Sign In Now
            </Button>
          </Section>

          <Hr style={divider} />

          <Section style={securityBox}>
            <Text style={securityText}>
              🔒 This login link is unique to you. Don't share it with anyone.
            </Text>
          </Section>

          <Text style={footerNote}>
            If the button doesn't work, copy and paste this link:
          </Text>
          <Text style={linkText}>{confirmationUrl}</Text>
        </Section>

        <Section style={footerSection}>
          <Text style={footerText}>
            If you didn't request this link, you can safely ignore this email.
          </Text>
          <Text style={copyright}>
            © 2026 ArcAI by Win The Night Productions
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const colors = {
  body: '#ffffff',
  surface: '#1a1a2e',
  primary: '#0080f0',
  primaryGlow: '#2e9beb',
  textLight: '#f0f0f5',
  textSecondary: '#a8a8b3',
  textMuted: '#71717a',
  border: '#2e2e42',
  securityBg: '#1e1e32',
}

const main = {
  backgroundColor: colors.body,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}

const outerContainer = { margin: '0 auto', padding: '40px 20px', maxWidth: '600px' }

const card = {
  backgroundColor: colors.surface,
  borderRadius: '16px',
  padding: '40px 32px',
  textAlign: 'center' as const,
}

const logoSection = { marginBottom: '16px', textAlign: 'center' as const }
const logo = { margin: '0 auto', borderRadius: '12px' }
const emoji = { fontSize: '42px', margin: '0 0 8px' }

const h1 = {
  color: colors.textLight,
  fontSize: '26px',
  fontWeight: '600' as const,
  margin: '0 0 16px',
}

const text = {
  color: colors.textSecondary,
  fontSize: '15px',
  lineHeight: '24px',
  margin: '0 0 28px',
}

const buttonContainer = { margin: '0 0 28px', textAlign: 'center' as const }

const primaryButton = {
  background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryGlow} 100%)`,
  borderRadius: '12px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600' as const,
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 40px',
  border: 'none',
}

const divider = { borderColor: colors.border, margin: '0 0 20px' }

const securityBox = {
  backgroundColor: colors.securityBg,
  borderRadius: '12px',
  padding: '14px 18px',
  marginBottom: '20px',
  textAlign: 'left' as const,
}

const securityText = { color: colors.textMuted, fontSize: '13px', lineHeight: '20px', margin: '0' }
const footerNote = { color: colors.textMuted, fontSize: '12px', margin: '0 0 8px' }
const linkText = { color: colors.primary, fontSize: '11px', wordBreak: 'break-all' as const, margin: '0' }
const footerSection = { paddingTop: '24px', textAlign: 'center' as const }
const footerText = { color: colors.textMuted, fontSize: '13px', margin: '0 0 8px' }
const copyright = { color: '#999999', fontSize: '12px', margin: '0' }
