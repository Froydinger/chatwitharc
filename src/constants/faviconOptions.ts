import {
  Rocket, Zap, Globe, Star, Gem, Target, Flame, Lightbulb, Code2, Layout, Layers, Box,
  Hexagon, Shield, Cpu, Terminal, Sparkles, Heart, Music, Camera, Palette, Gamepad2,
  BookOpen, ShoppingCart, MessageSquare, Map, Cloud, Coffee, Compass, Aperture,
  Atom, BrainCircuit, Crown, Fingerprint, Leaf, Pizza, Puzzle, Sailboat, Telescope, Trophy,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface FaviconOption {
  icon: LucideIcon;
  label: string;
  color: string;
  bg: string;
}

export const FAVICON_OPTIONS: FaviconOption[] = [
  { icon: Rocket, label: 'Rocket', color: '#fff', bg: '#6366f1' },
  { icon: Zap, label: 'Lightning', color: '#fbbf24', bg: '#1e1b4b' },
  { icon: Globe, label: 'Globe', color: '#38bdf8', bg: '#0f172a' },
  { icon: Star, label: 'Star', color: '#facc15', bg: '#1e1b4b' },
  { icon: Gem, label: 'Gem', color: '#a78bfa', bg: '#1e1b4b' },
  { icon: Target, label: 'Target', color: '#f87171', bg: '#1c1917' },
  { icon: Flame, label: 'Fire', color: '#f97316', bg: '#1c1917' },
  { icon: Lightbulb, label: 'Idea', color: '#fbbf24', bg: '#1e1b4b' },
  { icon: Code2, label: 'Code', color: '#34d399', bg: '#0f172a' },
  { icon: Layout, label: 'Layout', color: '#60a5fa', bg: '#0f172a' },
  { icon: Layers, label: 'Layers', color: '#c084fc', bg: '#1e1b4b' },
  { icon: Box, label: 'Box', color: '#fb923c', bg: '#1c1917' },
  { icon: Hexagon, label: 'Hexagon', color: '#2dd4bf', bg: '#0f172a' },
  { icon: Shield, label: 'Shield', color: '#60a5fa', bg: '#1e1b4b' },
  { icon: Cpu, label: 'CPU', color: '#34d399', bg: '#0f172a' },
  { icon: Terminal, label: 'Terminal', color: '#4ade80', bg: '#0a0a0a' },
  { icon: Sparkles, label: 'Sparkles', color: '#e879f9', bg: '#1e1b4b' },
  { icon: Heart, label: 'Heart', color: '#fb7185', bg: '#1c1917' },
  { icon: Music, label: 'Music', color: '#818cf8', bg: '#1e1b4b' },
  { icon: Camera, label: 'Camera', color: '#f472b6', bg: '#1c1917' },
  { icon: Palette, label: 'Palette', color: '#f472b6', bg: '#0f172a' },
  { icon: Gamepad2, label: 'Game', color: '#a78bfa', bg: '#1e1b4b' },
  { icon: BookOpen, label: 'Book', color: '#fbbf24', bg: '#1c1917' },
  { icon: ShoppingCart, label: 'Shop', color: '#34d399', bg: '#0f172a' },
  { icon: MessageSquare, label: 'Chat', color: '#60a5fa', bg: '#0f172a' },
  { icon: Map, label: 'Map', color: '#2dd4bf', bg: '#1e1b4b' },
  { icon: Cloud, label: 'Cloud', color: '#93c5fd', bg: '#0f172a' },
  { icon: Coffee, label: 'Coffee', color: '#d97706', bg: '#1c1917' },
  { icon: Compass, label: 'Compass', color: '#f87171', bg: '#1e1b4b' },
  { icon: Aperture, label: 'Aperture', color: '#c084fc', bg: '#0f172a' },
  { icon: Atom, label: 'Atom', color: '#38bdf8', bg: '#0f172a' },
  { icon: BrainCircuit, label: 'AI', color: '#a78bfa', bg: '#1e1b4b' },
  { icon: Crown, label: 'Crown', color: '#fbbf24', bg: '#1e1b4b' },
  { icon: Fingerprint, label: 'Fingerprint', color: '#6ee7b7', bg: '#0f172a' },
  { icon: Leaf, label: 'Leaf', color: '#4ade80', bg: '#0f172a' },
  { icon: Pizza, label: 'Pizza', color: '#fb923c', bg: '#1c1917' },
  { icon: Puzzle, label: 'Puzzle', color: '#60a5fa', bg: '#1e1b4b' },
  { icon: Sailboat, label: 'Sail', color: '#38bdf8', bg: '#0f172a' },
  { icon: Telescope, label: 'Telescope', color: '#c084fc', bg: '#1e1b4b' },
  { icon: Trophy, label: 'Trophy', color: '#fbbf24', bg: '#1c1917' },
];

export function getFaviconByLabel(label: string | null | undefined): FaviconOption | null {
  if (!label) return null;
  return FAVICON_OPTIONS.find(o => o.label === label) || null;
}
