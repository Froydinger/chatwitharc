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
  Button,
  Hr,
} from 'https://esm.sh/@react-email/components@0.0.22'
import * as React from 'https://esm.sh/react@18.3.1'

interface MagicLinkEmailProps {
  supabase_url: string
  email_action_type: string
  redirect_to: string
  token_hash: string
  token: string
  user_email: string
}

export const MagicLinkEmail = ({
  token_hash,
  supabase_url,
  email_action_type,
  redirect_to,
  token,
  user_email,
}: MagicLinkEmailProps) => {
  const verifyUrl = `${supabase_url}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`
  const baseUrl = redirect_to ? `${redirect_to.split('/')[0]}//${redirect_to.split('/')[2]}` : 'https://chatwitharc.lovable.app'
  
  return (
    <Html>
      <Head />
      <Preview>Your secure ArcAI login link is ready 🔑</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={headerSection}>
            <Img
              src={`${baseUrl}/arc-logo-ui.png`}
              width="64"
              height="64"
              alt="ArcAI"
              style={logo}
            />
            <Text style={brandName}>ArcAI</Text>
          </Section>
          
          {/* Main Card */}
          <Section style={cardSection}>
            <div style={iconContainer}>
              <Text style={keyIcon}>🔑</Text>
            </div>
            
            <Heading style={h1}>Sign in to ArcAI</Heading>
            
            <Text style={subtitle}>
              Click the button below to securely access your account
            </Text>
            
            <Section style={buttonContainer}>
              <Button style={primaryButton} href={verifyUrl}>
                Sign In Now
              </Button>
            </Section>
            
            <Hr style={divider} />
            
            <Text style={orText}>Or use this temporary code:</Text>
            
            <Section style={codeContainer}>
              <Text style={codeText}>{token}</Text>
            </Section>
            
            <Text style={codeHint}>
              This code expires in 24 hours
            </Text>
          </Section>
          
          {/* Security Notice */}
          <Section style={securitySection}>
            <Text style={securityIcon}>🔒</Text>
            <Text style={securityText}>
              This login link is unique to you. Don't share it with anyone.
              If you didn't request this, you can safely ignore this email.
            </Text>
          </Section>
          
          {/* Footer */}
          <Section style={footer}>
            <Text style={footerCopyright}>
              © 2025 ArcAI by Win The Night Productions
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

// Design tokens
const colors = {
  background: '#050505',
  surface: '#0f0f0f',
  surfaceLight: '#1a1a1a',
  primary: '#3b82f6',
  primaryGlow: '#06b6d4',
  text: '#ffffff',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',
  border: '#27272a',
}

const main = {
  backgroundColor: colors.background,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
}

const container = {
  margin: '0 auto',
  padding: '40px 20px',
  width: '100%',
  maxWidth: '480px',
}

const headerSection = {
  textAlign: 'center' as const,
  marginBottom: '32px',
}

const logo = {
  margin: '0 auto 12px',
  borderRadius: '12px',
}

const brandName = {
  color: colors.text,
  fontSize: '20px',
  fontWeight: '300',
  margin: '0',
  letterSpacing: '0.05em',
}

const cardSection = {
  backgroundColor: colors.surface,
  padding: '40px 32px',
  borderRadius: '20px',
  border: `1px solid ${colors.border}`,
  textAlign: 'center' as const,
}

const iconContainer = {
  marginBottom: '16px',
}

const keyIcon = {
  fontSize: '48px',
  margin: '0',
}

const h1 = {
  color: colors.text,
  fontSize: '28px',
  fontWeight: '600',
  margin: '0 0 12px',
}

const subtitle = {
  color: colors.textSecondary,
  fontSize: '15px',
  lineHeight: '24px',
  margin: '0 0 28px',
}

const buttonContainer = {
  margin: '0 0 28px',
}

const primaryButton = {
  background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryGlow} 100%)`,
  borderRadius: '10px',
  color: colors.text,
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 48px',
  border: 'none',
  boxShadow: `0 8px 20px ${colors.primary}30`,
}

const divider = {
  borderColor: colors.border,
  margin: '0 0 24px',
}

const orText = {
  color: colors.textMuted,
  fontSize: '13px',
  margin: '0 0 16px',
}

const codeContainer = {
  backgroundColor: colors.surfaceLight,
  border: `2px dashed ${colors.border}`,
  borderRadius: '12px',
  padding: '20px 24px',
  marginBottom: '12px',
}

const codeText = {
  color: colors.text,
  fontSize: '24px',
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
  fontWeight: '700',
  letterSpacing: '0.15em',
  margin: '0',
}

const codeHint = {
  color: colors.textMuted,
  fontSize: '12px',
  margin: '0',
}

const securitySection = {
  backgroundColor: colors.surfaceLight,
  padding: '20px 24px',
  borderRadius: '12px',
  marginTop: '24px',
  display: 'flex' as const,
  alignItems: 'flex-start' as const,
  gap: '12px',
}

const securityIcon = {
  fontSize: '20px',
  margin: '0',
  flexShrink: 0,
}

const securityText = {
  color: colors.textMuted,
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0',
  textAlign: 'left' as const,
}

const footer = {
  paddingTop: '32px',
  textAlign: 'center' as const,
}

const footerCopyright = {
  color: colors.textMuted,
  fontSize: '12px',
  margin: '0',
}

export default MagicLinkEmail