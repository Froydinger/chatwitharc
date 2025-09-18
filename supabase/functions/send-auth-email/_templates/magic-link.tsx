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
} from 'npm:@react-email/components@0.0.22'
import * as React from 'npm:react@18.3.1'

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
}: MagicLinkEmailProps) => (
  <Html>
    <Head />
    <Preview>Your ArcAI login link is ready</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoContainer}>
          <Img
            src={`${redirect_to.split('/')[0]}//${redirect_to.split('/')[2]}/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png`}
            width="64"
            height="64"
            alt="ArcAI"
            style={logo}
          />
        </Section>
        
        <Heading style={h1}>Sign in to ArcAI</Heading>
        
        <Text style={text}>
          Click the button below to securely sign in to your ArcAI account.
        </Text>
        
        <Section style={buttonContainer}>
          <Button
            style={button}
            href={`${supabase_url}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`}
          >
            Sign In to ArcAI
          </Button>
        </Section>
        
        <Text style={text}>
          Or use this temporary login code:
        </Text>
        
        <Section style={codeContainer}>
          <Text style={code}>{token}</Text>
        </Section>
        
        <Text style={footerText}>
          This link will expire in 24 hours. If you didn't request this login, you can safely ignore this email.
        </Text>
        
        <Section style={footer}>
          <Text style={footerCopyright}>
            © 2024 ArcAI. All rights reserved.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

const main = {
  backgroundColor: '#0a0a0a',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}

const container = {
  margin: '0 auto',
  padding: '20px 0 48px',
  width: '100%',
  maxWidth: '600px',
}

const logoContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
}

const logo = {
  margin: '0 auto',
  borderRadius: '12px',
}

const h1 = {
  color: '#ffffff',
  fontSize: '28px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  margin: '30px 0',
}

const text = {
  color: '#e5e7eb',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '16px 32px',
  textAlign: 'center' as const,
}

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
}

const button = {
  backgroundColor: '#3b82f6',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '16px 32px',
  border: 'none',
  cursor: 'pointer',
}

const codeContainer = {
  textAlign: 'center' as const,
  margin: '24px 32px',
}

const code = {
  backgroundColor: '#1f2937',
  border: '1px solid #374151',
  borderRadius: '8px',
  color: '#f3f4f6',
  fontSize: '18px',
  fontFamily: 'monospace',
  fontWeight: 'bold',
  padding: '16px 24px',
  letterSpacing: '2px',
  display: 'inline-block',
}

const footerText = {
  color: '#9ca3af',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '32px 32px 0',
  textAlign: 'center' as const,
}

const footer = {
  borderTop: '1px solid #374151',
  margin: '32px 32px 0',
  paddingTop: '24px',
}

const footerCopyright = {
  color: '#6b7280',
  fontSize: '12px',
  textAlign: 'center' as const,
  margin: '0',
}

export default MagicLinkEmail