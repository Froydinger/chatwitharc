import { useCallback } from "react";
import { useAuth } from "./useAuth";

export type GatedFeature =
  | "menu"
  | "music"
  | "tools"
  | "personas"
  | "voice"
  | "image-gen"
  | "files"
  | "research"
  | "code"
  | "canvas"
  | "boost"
  | "generic";

export interface AuthGateDetail {
  feature: GatedFeature;
  /** Optional human label used in the modal headline */
  label?: string;
}

/**
 * useRequireAuth — gate any action behind a real (non-anonymous) sign-in.
 *
 * Usage:
 *   const requireAuth = useRequireAuth();
 *   requireAuth("music", () => openMusic());
 *
 * If the user is signed in (and not anonymous), the callback runs immediately.
 * Otherwise the global `auth-gate-feature` event fires and AuthModal opens with
 * the matching context + Boost CTA.
 */
export function useRequireAuth() {
  const { user, isAnonymous } = useAuth();
  const isRealUser = !!user && !isAnonymous;

  return useCallback(
    (feature: GatedFeature, run?: () => void, label?: string) => {
      if (isRealUser) {
        run?.();
        return true;
      }
      window.dispatchEvent(
        new CustomEvent<AuthGateDetail>("auth-gate-feature", {
          detail: { feature, label },
        }),
      );
      return false;
    },
    [isRealUser],
  );
}
