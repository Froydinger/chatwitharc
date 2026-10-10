import { RefreshCcwDot, MoonStar, Sun, type LucideIcon } from 'lucide-react';
import { Galaxy } from '@/components/icons/Galaxy';
import type { ArcModelSelection } from '@/store/useModelStore';

/** One model-icon mapping for both pickers and recorded reply metadata. */
export const CHAT_MODEL_ICONS: Record<ArcModelSelection, LucideIcon> = {
  auto: RefreshCcwDot,
  'gpt-6-luna': MoonStar,
  'gpt-6.1-sol': Sun,
  'gpt-6-astra': Galaxy,
};

/** Unknown or historical provider ids keep their existing neutral icon. */
export function getRecordedChatModelIcon(modelUsed?: string): LucideIcon | undefined {
  return modelUsed === 'gpt-6-luna' || modelUsed === 'gpt-6.1-sol' || modelUsed === 'gpt-6-astra'
    ? CHAT_MODEL_ICONS[modelUsed] : undefined;
}
