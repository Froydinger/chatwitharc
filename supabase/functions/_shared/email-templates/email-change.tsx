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
  Link,
  Preview,
  Section,
  Text,
  Hr,
} from 'npm:@react-email/components@0.0.22'

interface EmailChangeEmailProps {
  siteName: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  email,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email change for ArcAI ✉️</Preview>
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

          <Text style={emoji}>✉️</Text>
          <Heading style={h1}>Confirm email change</Heading>

          <Text style={text}>
            You requested to change your ArcAI email from{' '}
            <Link href={`mailto:${email}`} style={link}>{email}</Link>{' '}
            to{' '}
            <Link href={`mailto:${newEmail}`} style={link}>{newEmail}</Link>.
          </Text>

          <Section style={buttonContainer}>
            <Button style={primaryButton} href={confirmationUrl}>
              Confirm Email Change
            </Button>
          </Section>

          <Hr style={divider} />

          <Section style={warningBox}>
            <Text style={warningText}>
              ⚠️ If you didn't request this change, please secure your account immediately.
            </Text>
          </Section>

          <Text style={footerNote}>
            If the button doesn't work, copy and paste this link:
          </Text>
          <Text style={linkText}>{confirmationUrl}</Text>
        </Section>

        <Section style={footerSection}>
          <Text style={copyright}>
            © 2026 ArcAI by Win The Night Productions
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

const colors = {
  body: '#ffffff',
  surface: '#1a1a2e',
  primary: '#0080f0',
  primaryGlow: '#2e9beb',
  textLight: '#f0f0f5',
  textSecondary: '#a8a8b3',
  textMuted: '#71717a',
  border: '#2e2e42',
  warningBg: '#2e1a00',
  warningColor: '#f59e0b',
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

const link = { color: colors.primary, textDecoration: 'underline' }
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

const warningBox = {
  backgroundColor: colors.warningBg,
  border: `1px solid ${colors.warningColor}40`,
  borderRadius: '12px',
  padding: '14px 18px',
  marginBottom: '20px',
  textAlign: 'left' as const,
}

const warningText = { color: colors.warningColor, fontSize: '13px', lineHeight: '20px', margin: '0' }
const footerNote = { color: colors.textMuted, fontSize: '12px', margin: '0 0 8px' }
const linkText = { color: colors.primary, fontSize: '11px', wordBreak: 'break-all' as const, margin: '0' }
const footerSection = { paddingTop: '24px', textAlign: 'center' as const }
const copyright = { color: '#999999', fontSize: '12px', margin: '0' }
