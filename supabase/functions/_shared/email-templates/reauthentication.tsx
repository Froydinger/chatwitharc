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
            src="https://jxywhodnndagbsmnbnnw.supabase.co/storage/v1/object/public/email-assets/arc-logo-ui.png"
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
          <Text style={copy}>© 2026 ArcAI by Win The Night Productions</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = {
  backgroundColor: '#f6f6f6',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}

const container = { margin: '0 auto', padding: '40px 0', maxWidth: '520px' }
const header = { textAlign: 'center' as const, paddingBottom: '24px' }
const logo = { margin: '0 auto', borderRadius: '12px' }

const content = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  padding: '40px 32px',
  textAlign: 'center' as const,
  border: '1px solid #e5e5e5',
}

const h1 = {
  color: '#111111',
  fontSize: '24px',
  fontWeight: '700' as const,
  margin: '0 0 16px',
  letterSpacing: '-0.3px',
}

const paragraph = {
  color: '#555555',
  fontSize: '15px',
  lineHeight: '26px',
  margin: '0 0 24px',
}

const codeBox = {
  backgroundColor: '#f0f4ff',
  border: '2px dashed #d0ddf5',
  borderRadius: '10px',
  padding: '20px 24px',
  marginBottom: '12px',
}

const codeText = {
  color: '#111111',
  fontSize: '32px',
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Courier, monospace',
  fontWeight: '700' as const,
  letterSpacing: '0.25em',
  margin: '0',
}

const hint = { color: '#999999', fontSize: '12px', margin: '0 0 0' }
const hr = { borderColor: '#eeeeee', margin: '0' }
const footer = { padding: '24px 32px', textAlign: 'center' as const }
const footerText = { color: '#999999', fontSize: '12px', lineHeight: '20px', margin: '0 0 4px' }
const copy = { color: '#bbbbbb', fontSize: '11px', margin: '12px 0 0' }
