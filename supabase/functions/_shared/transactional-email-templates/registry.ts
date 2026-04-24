/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as welcome } from './welcome.tsx'
import { template as bugReport } from './bug-report.tsx'
import { template as supportReply } from './support-reply.tsx'
import { template as ticketOpened } from './ticket-opened.tsx'
import { template as desktopLink } from './desktop-link.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'welcome': welcome,
  'bug-report': bugReport,
  'support-reply': supportReply,
  'ticket-opened': ticketOpened,
  'desktop-link': desktopLink,
}
