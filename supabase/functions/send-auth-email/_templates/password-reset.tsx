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

interface PasswordResetEmailProps {
  supabase_url: string
  email_action_type: string
  redirect_to: string
  token_hash: string
  token: string
  user_email: string
}

export const PasswordResetEmail = ({
  token_hash,
  supabase_url,
  email_action_type,
  redirect_to,
  user_email,
}: PasswordResetEmailProps) => {
  const verifyUrl = `${supabase_url}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`
  const baseUrl = redirect_to ? `${redirect_to.split('/')[0]}//${redirect_to.split('/')[2]}` : 'https://chatwitharc.lovable.app'
  
  return (
    <Html>
      <Head />
      <Preview>Reset your ArcAI password 🔐</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={headerSection}>
            <Img
              src={`${baseUrl}/arc-logo-ui.png`}
              width="56"
              height="56"
              alt="ArcAI"
              style={logo}
            />
          </Section>
          
          {/* Main Card */}
          <Section style={cardSection}>
            <div style={iconContainer}>
              <Text style={lockIcon}>🔐</Text>
            </div>
            
            <Heading style={h1}>Reset your password</Heading>
            
            <Text style={subtitle}>
              We received a request to reset the password for your ArcAI account 
              associated with <strong>{user_email}</strong>.
            </Text>
            
            <Section style={buttonContainer}>
              <Button style={primaryButton} href={verifyUrl}>
                Reset Password
              </Button>
            </Section>
            
            <Hr style={divider} />
            
            <Section style={warningSection}>
              <Text style={warningIcon}>⚠️</Text>
              <Text style={warningText}>
                This link will expire in 24 hours. If you didn't request a password reset, 
                please ignore this email or contact us if you're concerned about your account security.
              </Text>
            </Section>
            
            <Text style={linkFallback}>
              If the button doesn't work, copy and paste this link into your browser:
            </Text>
            <Text style={linkText}>
              {verifyUrl}
            </Text>
          </Section>
          
          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Need help? Reply to this email and we'll assist you.
            </Text>
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
  warning: '#f59e0b',
  warningBg: '#451a03',
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
  marginBottom: '24px',
}

const logo = {
  margin: '0 auto',
  borderRadius: '12px',
}

const cardSection = {
  backgroundColor: colors.surface,
  padding: '36px 28px',
  borderRadius: '20px',
  border: `1px solid ${colors.border}`,
  textAlign: 'center' as const,
}

const iconContainer = {
  marginBottom: '16px',
}

const lockIcon = {
  fontSize: '48px',
  margin: '0',
}

const h1 = {
  color: colors.text,
  fontSize: '26px',
  fontWeight: '600',
  margin: '0 0 16px',
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
  padding: '14px 40px',
  border: 'none',
  boxShadow: `0 8px 20px ${colors.primary}30`,
}

const divider = {
  borderColor: colors.border,
  margin: '0 0 24px',
}

const warningSection = {
  backgroundColor: colors.warningBg,
  border: `1px solid ${colors.warning}40`,
  borderRadius: '12px',
  padding: '16px 20px',
  marginBottom: '24px',
  textAlign: 'left' as const,
}

const warningIcon = {
  fontSize: '18px',
  margin: '0 0 8px',
}

const warningText = {
  color: colors.warning,
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0',
}

const linkFallback = {
  color: colors.textMuted,
  fontSize: '12px',
  margin: '0 0 8px',
}

const linkText = {
  color: colors.primary,
  fontSize: '11px',
  wordBreak: 'break-all' as const,
  margin: '0',
}

const footer = {
  paddingTop: '28px',
  textAlign: 'center' as const,
}

const footerText = {
  color: colors.textSecondary,
  fontSize: '13px',
  margin: '0 0 12px',
}

const footerCopyright = {
  color: colors.textMuted,
  fontSize: '12px',
  margin: '0',
}

export default PasswordResetEmail