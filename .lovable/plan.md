

## Branded Auth Email Templates for ArcAI

### What we're doing
Scaffold Lovable's managed auth email templates, then customize all 6 templates to match ArcAI's dark glassmorphism aesthetic with the blue primary brand color. These replace the existing manual `send-auth-email` Resend-based templates with the managed Lovable email flow using `notify.askarc.chat`.

### Brand extraction
From `src/index.css`:
- **Primary**: `hsl(205, 100%, 48%)` — vibrant blue
- **Primary glow**: `hsl(205, 95%, 58%)` — lighter blue for gradients
- **Background**: `hsl(240, 8%, 12%)` — near-black dark surface
- **Foreground**: `hsl(240, 5%, 96%)` — near-white text
- **Muted foreground**: `hsl(240, 3%, 68%)` — grey secondary text
- **Border**: `hsl(240, 8%, 20%)` — subtle dark borders
- **Border radius**: `0.75rem`
- **Tone**: Casual, friendly ("Welcome back!", "Welcome aboard!", emoji usage)
- **Logo**: `/arc-logo-ui.png`

### Email body background
Per requirements, email body background must be **white (#ffffff)** for deliverability. The dark card/surface styling goes inside a centered container, creating a "dark card on white canvas" look that works universally across email clients.

### Steps

1. **Scaffold templates** — Call `scaffold_auth_email_templates` to generate the 6 managed templates (signup, recovery, magic-link, invite, email-change, reauthentication) plus the `auth-email-hook` edge function.

2. **Brand all 6 templates** — Apply ArcAI's design system to each:
   - Dark card container (`#1a1a2e` surface) on white body
   - Blue gradient CTA buttons matching the primary color
   - ArcAI logo at the top of every email
   - Casual, on-brand copy (e.g., "Welcome aboard! 🎉" for signup, "Let's get you back in 🔑" for magic link)
   - Responsive layout that works on all device sizes (600px max-width container, fluid padding)
   - Consistent footer: "© 2025 ArcAI by Win The Night Productions"

3. **Deploy** — Deploy `auth-email-hook` edge function so the new templates go live.

4. **Confirm** — Provide email preview links and Cloud → Emails monitoring link.

### Template design pattern (applied to all 6)
- White outer body for universal email client compatibility
- Centered 600px max-width dark card with rounded corners
- Logo centered at top
- Emoji-accented headings
- Blue gradient primary button (same as app's CTA style)
- Muted grey helper text and fallback links
- Mobile-responsive with fluid padding

### Existing `send-auth-email` function
The old Resend-based `send-auth-email` function will remain in the codebase but becomes inactive once the Lovable managed `auth-email-hook` takes over auth email routing. No deletion needed — Lovable's system routes to `auth-email-hook` automatically.

