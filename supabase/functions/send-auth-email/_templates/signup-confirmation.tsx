import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Button,
  Row,
  Column,
  Hr,
} from 'https://esm.sh/@react-email/components@0.0.22'
import * as React from 'https://esm.sh/react@18.3.1'

interface SignupConfirmationEmailProps {
  supabase_url: string
  email_action_type: string
  redirect_to: string
  token_hash: string
  token: string
  user_email: string
}

export const SignupConfirmationEmail = ({
  token_hash,
  supabase_url,
  email_action_type,
  redirect_to,
  user_email,
}: SignupConfirmationEmailProps) => {
  const verifyUrl = `${supabase_url}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`
  const baseUrl = redirect_to ? `${redirect_to.split('/')[0]}//${redirect_to.split('/')[2]}` : 'https://chatwitharc.lovable.app'
  
  return (
    <Html>
      <Head />
      <Preview>Welcome to ArcAI - Your AI companion awaits ✨</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header with gradient */}
          <Section style={headerSection}>
            <div style={gradientOverlay} />
            <Img
              src={`${baseUrl}/arc-logo-ui.png`}
              width="80"
              height="80"
              alt="ArcAI"
              style={logo}
            />
          </Section>
          
          {/* Main Card */}
          <Section style={cardSection}>
            <Heading style={h1}>Welcome aboard! 🎉</Heading>
            
            <Text style={heroText}>
              You're about to unlock the power of AI-assisted creativity. 
              ArcAI is your intelligent companion for chat, code, research, and creation.
            </Text>
            
            <Section style={buttonContainer}>
              <Button style={primaryButton} href={verifyUrl}>
                Confirm Email & Get Started
              </Button>
            </Section>
            
            <Hr style={divider} />
            
            {/* Feature highlights */}
            <Text style={featuresTitle}>What you'll get:</Text>
            <Section style={featuresSection}>
              <Row>
                <Column style={featureColumn}>
                  <Text style={featureIcon}>💬</Text>
                  <Text style={featureLabel}>Smart Chat</Text>
                  <Text style={featureDesc}>Natural conversations with AI</Text>
                </Column>
                <Column style={featureColumn}>
                  <Text style={featureIcon}>🎨</Text>
                  <Text style={featureLabel}>Image Gen</Text>
                  <Text style={featureDesc}>Create stunning visuals</Text>
                </Column>
                <Column style={featureColumn}>
                  <Text style={featureIcon}>🔍</Text>
                  <Text style={featureLabel}>Web Search</Text>
                  <Text style={featureDesc}>Real-time information</Text>
                </Column>
              </Row>
            </Section>
            
            <Hr style={divider} />
            
            <Text style={fallbackText}>
              Or copy and paste this link:
            </Text>
            <Text style={linkText}>
              {verifyUrl}
            </Text>
          </Section>
          
          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              If you didn't create an account, you can safely ignore this email.
            </Text>
            <Text style={footerCopyright}>
              © 2025 ArcAI by Win The Night Productions
            </Text>
            <Text style={footerLinks}>
              Made with ✨ for creators everywhere
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
  accent: '#8b5cf6',
}

const main = {
  backgroundColor: colors.background,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
}

const container = {
  margin: '0 auto',
  padding: '0',
  width: '100%',
  maxWidth: '600px',
}

const headerSection = {
  background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryGlow} 50%, ${colors.accent} 100%)`,
  padding: '48px 0 64px',
  textAlign: 'center' as const,
  borderRadius: '0 0 24px 24px',
  position: 'relative' as const,
}

const gradientOverlay = {
  position: 'absolute' as const,
  inset: 0,
  background: 'radial-gradient(ellipse at top, rgba(255,255,255,0.1) 0%, transparent 70%)',
}

const logo = {
  margin: '0 auto',
  borderRadius: '16px',
  boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
  position: 'relative' as const,
}

const cardSection = {
  backgroundColor: colors.surface,
  margin: '-32px 24px 0',
  padding: '40px 32px',
  borderRadius: '24px',
  border: `1px solid ${colors.border}`,
  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
  position: 'relative' as const,
}

const h1 = {
  color: colors.text,
  fontSize: '32px',
  fontWeight: '700',
  textAlign: 'center' as const,
  margin: '0 0 16px',
  letterSpacing: '-0.02em',
}

const heroText = {
  color: colors.textSecondary,
  fontSize: '16px',
  lineHeight: '26px',
  textAlign: 'center' as const,
  margin: '0 0 32px',
}

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '0 0 32px',
}

const primaryButton = {
  background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryGlow} 100%)`,
  borderRadius: '12px',
  color: colors.text,
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '16px 40px',
  border: 'none',
  boxShadow: `0 8px 24px ${colors.primary}40`,
}

const divider = {
  borderColor: colors.border,
  margin: '32px 0',
}

const featuresTitle = {
  color: colors.textSecondary,
  fontSize: '14px',
  fontWeight: '500',
  textAlign: 'center' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  margin: '0 0 24px',
}

const featuresSection = {
  margin: '0 0 24px',
}

const featureColumn = {
  textAlign: 'center' as const,
  padding: '0 8px',
}

const featureIcon = {
  fontSize: '28px',
  margin: '0 0 8px',
}

const featureLabel = {
  color: colors.text,
  fontSize: '14px',
  fontWeight: '600',
  margin: '0 0 4px',
}

const featureDesc = {
  color: colors.textMuted,
  fontSize: '12px',
  margin: '0',
}

const fallbackText = {
  color: colors.textMuted,
  fontSize: '13px',
  textAlign: 'center' as const,
  margin: '0 0 8px',
}

const linkText = {
  color: colors.primary,
  fontSize: '12px',
  textAlign: 'center' as const,
  wordBreak: 'break-all' as const,
  margin: '0',
}

const footer = {
  padding: '32px 24px',
  textAlign: 'center' as const,
}

const footerText = {
  color: colors.textMuted,
  fontSize: '13px',
  margin: '0 0 16px',
}

const footerCopyright = {
  color: colors.textMuted,
  fontSize: '12px',
  margin: '0 0 8px',
}

const footerLinks = {
  color: colors.textSecondary,
  fontSize: '12px',
  margin: '0',
}

export default SignupConfirmationEmail