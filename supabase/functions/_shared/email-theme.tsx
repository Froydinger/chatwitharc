/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Head } from 'npm:@react-email/components@0.0.22'

// ArcAI email is intentionally dark in every client. The metadata prevents
// clients from inheriting the device theme; the CSS supplies explicit fallbacks
// for clients that partially rewrite colors in dark mode.
export const EmailHead = () => (
  <Head>
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <style>{`
      :root { color-scheme: dark; supported-color-schemes: dark; }
      html, body { background: #09090b !important; background-color: #09090b !important; background-image: linear-gradient(#09090b, #09090b) !important; }
      .arc-email-shell { background: #09090b !important; background-color: #09090b !important; background-image: linear-gradient(#09090b, #09090b) !important; }
      [data-ogsc] .arc-email-shell { background: #09090b !important; background-color: #09090b !important; background-image: linear-gradient(#09090b, #09090b) !important; }
      [data-ogsb] .arc-email-shell { background: #09090b !important; background-color: #09090b !important; background-image: linear-gradient(#09090b, #09090b) !important; }
      .arc-email-shell h1,
      .arc-email-shell h2,
      .arc-email-shell h3,
      .arc-email-shell p:not(.arc-email-emoji) {
        color: #f4f4f5 !important;
        background-image: linear-gradient(#f4f4f5, #f4f4f5) !important;
        background-clip: text !important;
        -webkit-background-clip: text !important;
        -webkit-text-fill-color: transparent !important;
      }
      .arc-email-shell .arc-email-emoji {
        background-image: none !important;
        -webkit-text-fill-color: initial !important;
      }
    `}</style>
  </Head>
)

export const ARC_EMAIL_BODY_PROPS = {
  className: 'arc-email-shell',
  bgcolor: '#09090b',
} as const
