# ArcAI Project Guide

## Overview
ArcAI is a modern AI-powered application with a beautiful glass UI, built with React, TypeScript, and Supabase. The app combines AI chat capabilities with Canvas (code/prose editor), Search, and team collaboration features.

## Tech Stack
- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS with custom glass morphism components
- **UI Components**: Custom shadcn/ui components
- **Animations**: Framer Motion
- **State Management**: Zustand (useArcStore)
- **Backend**: Supabase (auth, database, storage, functions)
- **Icons**: Lucide React

## Key Features
- **Canvas**: AI-powered code/prose editor with real-time typing
- **Deep Search**: Web search with AI summaries and citations
- **Team Chats**: Real-time collaboration with @arc mentions and image attachments
- **Memory System**: Save and recall context across conversations
- **Scheduled Reminders**: Set automatic reminders with visual feedback
- **Music Player**: Audio playback with Spotify integration
- **Local AI**: On-device AI models (Boost feature)

## Important Workflows

### Git Workflow
- **Commit directly to main** - no feature branches needed (main is local development)
- Use clear, descriptive commit messages
- Example: `git add -A && git commit -m "Add image attachments to team chats"` then `git push origin main`

### Component Patterns
- Use `motion` and `AnimatePresence` from Framer Motion for animations
- Leverage `glass-card`, `glass-dock`, `glass-shimmer` classes for glassmorphism UI
- Use `ThemedLogo` component for Arc's avatar (automatically tints to primary color)
- Follow existing MessageBubble pattern for message rendering

### State Management
- Use `useArcStore` for global chat and memory state
- Use `useState` for local component state
- Prefer `useState` for temporary UI state, Zustand for persistent data

### Image Uploads
- Use Supabase `storage.from("avatars")` bucket for image uploads
- Generate unique paths: `${userId}/team-chat-${chatId}-${timestamp}-${random}.ext`
- Return public URLs via `getPublicUrl()`
- Store as attachments with type: `"image"` in message objects

### File Organization
- `src/pages/`: Full page components
- `src/components/`: Reusable UI components
- `src/store/`: Zustand stores
- `src/integrations/`: External service integrations
- `src/hooks/`: Custom React hooks

## Styling Guidelines
- Primary color is teal/cyan (CSS variable `--primary`)
- Use opacity variants: `bg-primary/10`, `text-primary/70`
- Glass UI: Use `glass-card`, `glass-dock`, `glass-shimmer` classes
- Rounded corners: Prefer `rounded-2xl` for cards, `rounded-full` for buttons
- Spacing: Use Tailwind spacing scale (4px base)

## Component Tips
- **ThemedLogo**: Use for Arc's avatar in messages and UI
- **MessageBubble**: Use for rendering message content (handles text, images, markdown)
- **MemoryIndicator**: Shows tool usage badge with modal details
- **ToolsUsedModal**: Displays all actions taken (web search, memory, etc.)

## Key Files
- `src/pages/SharedChatRoomPage.tsx`: Team chat implementation
- `src/components/LandingScreen.tsx`: Landing page with demos
- `src/components/LandingCanvasDemo.tsx`: Canvas/Reminders/TeamChat demos
- `src/store/useArcStore.ts`: Main chat state management
- `src/components/MessageBubble.tsx`: Message rendering with typewriter

## Common Tasks

### Adding a Modal
Use shadcn Dialog component with glass styling:
```tsx
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent className="glass-card max-w-md">
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
    {/* content */}
  </DialogContent>
</Dialog>
```

### Handling @mentions
Match pattern: `/@([\w-]+)/g` to find mentioned usernames
Check against profile display_name for matches

### Image Attachments
1. File input → handleFileSelect → setSelectedImages
2. Display preview with remove button on hover
3. Upload before send → uploadImagesToStorage
4. Add attachments to message: `{ type: "image", url: ... }`

## Notes
- Main branch is local development only (never live)
- All changes can be committed directly to main
- Landing page demos use real UI simulation with Framer Motion
- Team chats support real-time updates via Supabase channels
