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
  Row,
  Column,
  Hr,
} from 'https://esm.sh/@react-email/components@0.0.22'
import * as React from 'https://esm.sh/react@18.3.1'

interface WelcomeEmailProps {
  user_email: string
  user_name?: string
}

export const WelcomeEmail = ({
  user_email,
  user_name,
}: WelcomeEmailProps) => {
  const baseUrl = 'https://chatwitharc.lovable.app'
  const displayName = user_name || user_email.split('@')[0]
  
  return (
    <Html>
      <Head />
      <Preview>Welcome to ArcAI - Your AI journey begins now! 🚀</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header with gradient */}
          <Section style={headerSection}>
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
            <Text style={welcomeEmoji}>🎉</Text>
            
            <Heading style={h1}>
              Welcome, {displayName}!
            </Heading>
            
            <Text style={heroText}>
              Your account is all set up and ready to go. 
              You're now part of a growing community of creators, developers, 
              and thinkers using AI to do amazing things.
            </Text>
            
            <Section style={buttonContainer}>
              <Button style={primaryButton} href={baseUrl}>
                Start Chatting
              </Button>
            </Section>
            
            <Hr style={divider} />
            
            {/* Tips Section */}
            <Text style={tipsTitle}>Quick tips to get started:</Text>
            
            <Section style={tipSection}>
              <Row style={tipRow}>
                <Column style={tipIconColumn}>
                  <Text style={tipIcon}>💡</Text>
                </Column>
                <Column style={tipTextColumn}>
                  <Text style={tipHeading}>Just ask naturally</Text>
                  <Text style={tipDesc}>Type or speak like you're talking to a friend</Text>
                </Column>
              </Row>
              
              <Row style={tipRow}>
                <Column style={tipIconColumn}>
                  <Text style={tipIcon}>🎨</Text>
                </Column>
                <Column style={tipTextColumn}>
                  <Text style={tipHeading}>Generate images</Text>
                  <Text style={tipDesc}>Use /image or tap the image button to create visuals</Text>
                </Column>
              </Row>
              
              <Row style={tipRow}>
                <Column style={tipIconColumn}>
                  <Text style={tipIcon}>🔍</Text>
                </Column>
                <Column style={tipTextColumn}>
                  <Text style={tipHeading}>Research anything</Text>
                  <Text style={tipDesc}>Use /search for real-time web information</Text>
                </Column>
              </Row>
              
              <Row style={tipRow}>
                <Column style={tipIconColumn}>
                  <Text style={tipIcon}>✍️</Text>
                </Column>
                <Column style={tipTextColumn}>
                  <Text style={tipHeading}>Write & code</Text>
                  <Text style={tipDesc}>Use /write or /code for canvas mode</Text>
                </Column>
              </Row>
            </Section>
          </Section>
          
          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Need help? Just ask ArcAI anything!
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
  maxWidth: '560px',
}

const headerSection = {
  background: `linear-gradient(135deg, ${colors.accent} 0%, ${colors.primary} 50%, ${colors.primaryGlow} 100%)`,
  padding: '48px 0 64px',
  textAlign: 'center' as const,
  borderRadius: '0 0 24px 24px',
}

const logo = {
  margin: '0 auto',
  borderRadius: '16px',
  boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
  backgroundColor: '#000000',
}

const cardSection = {
  backgroundColor: colors.surface,
  margin: '-32px 20px 0',
  padding: '36px 28px',
  borderRadius: '20px',
  border: `1px solid ${colors.border}`,
  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
}

const welcomeEmoji = {
  fontSize: '48px',
  textAlign: 'center' as const,
  margin: '0 0 16px',
}

const h1 = {
  color: colors.text,
  fontSize: '28px',
  fontWeight: '700',
  textAlign: 'center' as const,
  margin: '0 0 16px',
}

const heroText = {
  color: colors.textSecondary,
  fontSize: '15px',
  lineHeight: '24px',
  textAlign: 'center' as const,
  margin: '0 0 28px',
}

const buttonContainer = {
  textAlign: 'center' as const,
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
  padding: '14px 36px',
  border: 'none',
  boxShadow: `0 8px 20px ${colors.primary}30`,
}

const divider = {
  borderColor: colors.border,
  margin: '0 0 24px',
}

const tipsTitle = {
  color: colors.textSecondary,
  fontSize: '14px',
  fontWeight: '500',
  margin: '0 0 20px',
}

const tipSection = {
  padding: '0',
}

const tipRow = {
  marginBottom: '16px',
}

const tipIconColumn = {
  width: '40px',
  verticalAlign: 'top' as const,
}

const tipTextColumn = {
  verticalAlign: 'top' as const,
}

const tipIcon = {
  fontSize: '20px',
  margin: '0',
}

const tipHeading = {
  color: colors.text,
  fontSize: '14px',
  fontWeight: '600',
  margin: '0 0 2px',
}

const tipDesc = {
  color: colors.textMuted,
  fontSize: '13px',
  margin: '0',
}

const footer = {
  padding: '28px 20px',
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

export default WelcomeEmail