import { CircleArrowUp, CircleFadingArrowUp, type LucideProps } from 'lucide-react';

/** Presentation only. Callers supply their existing verified plan/admin state. */
export function BoostIcon({ hasBoost, ...props }: LucideProps & { hasBoost: boolean }) {
  const Icon = hasBoost ? CircleArrowUp : CircleFadingArrowUp;
  return <Icon role="img" aria-label={hasBoost ? 'Boost active' : 'Get Boost'} {...props} />;
}
