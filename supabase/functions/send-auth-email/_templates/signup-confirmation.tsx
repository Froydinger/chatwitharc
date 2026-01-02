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
}: SignupConfirmationEmailProps) => (
  <Html>
    <Head />
    <Preview>Welcome to ArcAI - Confirm your account</Preview>
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
        
        <Heading style={h1}>Welcome to ArcAI!</Heading>
        
        <Text style={text}>
          Hi there! Thanks for signing up for ArcAI. To get started, please confirm your email address by clicking the button below.
        </Text>
        
        <Section style={buttonContainer}>
          <Button
            style={button}
            href={`${supabase_url}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`}
          >
            Confirm Email Address
          </Button>
        </Section>
        
        <Text style={text}>
          Or copy and paste this link into your browser:
        </Text>
        
        <Link
          href={`${supabase_url}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`}
          style={link}
        >
          {`${supabase_url}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`}
        </Link>
        
        <Text style={footerText}>
          If you didn't create an account with ArcAI, you can safely ignore this email.
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

const link = {
  color: '#3b82f6',
  fontSize: '14px',
  textDecoration: 'underline',
  wordBreak: 'break-all' as const,
  margin: '0 32px',
  display: 'block',
  textAlign: 'center' as const,
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

export default SignupConfirmationEmail