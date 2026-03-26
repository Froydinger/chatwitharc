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

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to ArcAI</Preview>
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
          <Heading style={h1}>You're invited! 🎉</Heading>
          <Text style={paragraph}>
            You've been invited to join ArcAI — your AI-powered assistant. Click below to accept and create your account.
          </Text>

          <Section style={btnWrap}>
            <Button style={btn} href={confirmationUrl}>
              Accept Invitation
            </Button>
          </Section>
        </Section>

        <Hr style={hr} />

        <Section style={footer}>
          <Text style={footerText}>
            If you weren't expecting this, you can ignore it.
          </Text>
          <Text style={footerText}>
            <Link href={confirmationUrl} style={footerLink}>
              Click here if the button doesn't work
            </Link>
          </Text>
          <Text style={copy}>© 2026 ArcAI by Win The Night Productions</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

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
  margin: '0 0 28px',
}

const btnWrap = { textAlign: 'center' as const }

const btn = {
  backgroundColor: '#0080f0',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '600' as const,
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 32px',
  border: 'none',
}

const hr = { borderColor: '#eeeeee', margin: '0' }
const footer = { padding: '24px 32px', textAlign: 'center' as const }
const footerText = { color: '#999999', fontSize: '12px', lineHeight: '20px', margin: '0 0 4px' }
const footerLink = { color: '#0080f0', textDecoration: 'underline', fontSize: '12px' }
const copy = { color: '#bbbbbb', fontSize: '11px', margin: '12px 0 0' }
