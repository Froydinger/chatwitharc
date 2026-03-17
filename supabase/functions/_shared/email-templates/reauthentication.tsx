/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
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

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your ArcAI verification code 🔒</Preview>
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

          <Text style={emoji}>🔒</Text>
          <Heading style={h1}>Verify your identity</Heading>

          <Text style={text}>
            Use the code below to confirm your identity:
          </Text>

          <Section style={codeBox}>
            <Text style={codeText}>{token}</Text>
          </Section>

          <Text style={codeHint}>This code expires shortly</Text>

          <Hr style={divider} />

          <Text style={footerNote}>
            If you didn't request this, you can safely ignore this email.
          </Text>
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

export default ReauthenticationEmail

const colors = {
  body: '#ffffff',
  surface: '#1a1a2e',
  primary: '#0080f0',
  textLight: '#f0f0f5',
  textSecondary: '#a8a8b3',
  textMuted: '#71717a',
  border: '#2e2e42',
  codeBg: '#24243e',
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
  margin: '0 0 24px',
}

const codeBox = {
  backgroundColor: colors.codeBg,
  border: `2px dashed ${colors.border}`,
  borderRadius: '12px',
  padding: '20px 24px',
  marginBottom: '12px',
}

const codeText = {
  color: colors.textLight,
  fontSize: '28px',
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Courier, monospace',
  fontWeight: '700' as const,
  letterSpacing: '0.2em',
  margin: '0',
}

const codeHint = { color: colors.textMuted, fontSize: '12px', margin: '0 0 24px' }
const divider = { borderColor: colors.border, margin: '0 0 20px' }
const footerNote = { color: colors.textMuted, fontSize: '12px', margin: '0' }
const footerSection = { paddingTop: '24px', textAlign: 'center' as const }
const copyright = { color: '#999999', fontSize: '12px', margin: '0' }
