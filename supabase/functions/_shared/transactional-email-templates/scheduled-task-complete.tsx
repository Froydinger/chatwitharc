/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ArcAI'

interface ScheduledTaskCompleteProps {
  taskTitle?: string
  preview?: string
  chatUrl?: string
}

const ScheduledTaskCompleteEmail = ({
  taskTitle = 'Your scheduled task',
  preview = '',
  chatUrl = 'https://askarc.chat/dashboard',
}: ScheduledTaskCompleteProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>✅ {taskTitle} is done — open it in {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Img
            src="https://askarc.chat/arc-logo-ui.png"
            width="56" height="56" alt="ArcAI" style={logo}
          />
        </Section>
        <Section style={content}>
          <Text style={emoji}>✅</Text>
          <Heading style={h1}>{taskTitle}</Heading>
          <Text style={paragraph}>
            Your scheduled task just finished. Here's a quick peek — open the full results in {SITE_NAME} anytime.
          </Text>
          {preview && (
            <Section style={previewBox}>
              <Text style={previewText}>{preview}</Text>
            </Section>
          )}
          <Section style={ctaWrap}>
            <Button style={button} href={chatUrl}>Open results</Button>
          </Section>
          <Hr style={hr} />
          <Text style={tipDesc}>
            You can manage or pause this task anytime from your Scheduled Tasks dashboard.
          </Text>
        </Section>
        <Section style={footer}>
          <Text style={copy}>© 2026 ArcAI by Win The Night™ Foundation</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ScheduledTaskCompleteEmail,
  subject: (d: Record<string, any>) => `✅ ${d?.taskTitle ?? 'Your scheduled task'} is done`,
  displayName: 'Scheduled task complete',
  previewData: {
    taskTitle: 'Morning AI briefing',
    preview: 'Top 3 AI stories today: 1) ... 2) ... 3) ...',
    chatUrl: 'https://askarc.chat/chat/abc',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#09090b', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }
const container = { margin: '0 auto', padding: '40px 0', maxWidth: '560px' }
const header = { textAlign: 'center' as const, paddingBottom: '24px' }
const logo = { margin: '0 auto', borderRadius: '14px' }
const content = { backgroundColor: '#18181b', borderRadius: '16px', padding: '40px 32px', border: '1px solid rgba(0, 128, 240, 0.25)' }
const emoji = { fontSize: '48px', textAlign: 'center' as const, margin: '0 0 16px' }
const h1 = { color: '#fafafa', fontSize: '24px', fontWeight: '700' as const, textAlign: 'center' as const, margin: '0 0 12px' }
const paragraph = { color: '#a1a1aa', fontSize: '15px', lineHeight: '26px', textAlign: 'center' as const, margin: '0 0 20px' }
const previewBox = { backgroundColor: '#09090b', border: '1px solid rgba(0, 128, 240, 0.15)', borderRadius: '10px', padding: '16px', margin: '0 0 24px' }
const previewText = { color: '#fafafa', fontSize: '14px', lineHeight: '22px', margin: '0', whiteSpace: 'pre-wrap' as const }
const ctaWrap = { textAlign: 'center' as const, margin: '0 0 12px' }
const button = { backgroundColor: '#0080f0', borderRadius: '10px', color: '#ffffff', fontSize: '16px', fontWeight: '600' as const, textDecoration: 'none', textAlign: 'center' as const, display: 'inline-block', padding: '14px 36px', boxShadow: '0 4px 12px rgba(0, 128, 240, 0.3)' }
const hr = { borderColor: '#27272a', margin: '20px 0' }
const tipDesc = { color: '#71717a', fontSize: '12px', textAlign: 'center' as const, margin: '0' }
const footer = { padding: '28px 20px', textAlign: 'center' as const }
const copy = { color: '#52525b', fontSize: '11px', margin: '0' }
