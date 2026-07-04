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
    <Preview>Your ArcAI verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Img
            src="https://askarc.chat/arc-logo-ui.png"
            width="48"
            height="48"
            alt="ArcAI"
            style={logo}
          />
        </Section>

        <Section style={content}>
          <Heading style={h1}>Verification code</Heading>
          <Text style={paragraph}>
            Use the code below to verify your identity:
          </Text>

          <Section style={codeBox}>
            <Text style={codeText}>{token}</Text>
          </Section>

          <Text style={hint}>This code expires shortly</Text>
        </Section>

        <Hr style={hr} />

        <Section style={footer}>
          <Text style={footerText}>
            If you didn't request this, you can ignore this email.
          </Text>
          <Text style={copy}>© 2026 ArcAI by Win The Night™ Foundation</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = {
  backgroundColor: '#09090b',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}
const container = { margin: '0 auto', padding: '40px 0', maxWidth: '520px' }
const header = { textAlign: 'center' as const, paddingBottom: '24px' }
const logo = { margin: '0 auto', borderRadius: '12px' }
const content = {
  backgroundColor: '#18181b',
  borderRadius: '12px',
  padding: '40px 32px',
  textAlign: 'center' as const,
  border: '1px solid rgba(0, 128, 240, 0.25)',
}
const h1 = { color: '#fafafa', fontSize: '24px', fontWeight: '700' as const, margin: '0 0 16px', letterSpacing: '-0.3px' }
const paragraph = { color: '#a1a1aa', fontSize: '15px', lineHeight: '26px', margin: '0 0 24px' }
const codeBox = {
  backgroundColor: '#09090b',
  border: '2px dashed rgba(0, 128, 240, 0.35)',
  borderRadius: '10px',
  padding: '20px 24px',
  marginBottom: '12px',
}
const codeText = {
  color: '#0080f0',
  fontSize: '32px',
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Courier, monospace',
  fontWeight: '700' as const,
  letterSpacing: '0.25em',
  margin: '0',
}
const hint = { color: '#71717a', fontSize: '12px', margin: '0 0 0' }
const hr = { borderColor: '#27272a', margin: '20px 0' }
const footer = { padding: '24px 32px', textAlign: 'center' as const }
const footerText = { color: '#71717a', fontSize: '12px', lineHeight: '20px', margin: '0 0 4px' }
const copy = { color: '#52525b', fontSize: '11px', margin: '12px 0 0' }
