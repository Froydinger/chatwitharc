import { useEffect, useState } from "react";
import { AuthModal } from "@/components/AuthModal";
import { GUEST_CHAT_ENABLED } from "@/lib/features";
import { useAuth } from "@/hooks/useAuth";
import type { AuthGateDetail, GatedFeature } from "@/hooks/useRequireAuth";

/**
 * Listens for the global `auth-gate-feature` event and renders the AuthModal
 * with matching contextual copy. Also fires
 * `arcai-auth-completed` when the user transitions from anonymous → real, so
 * post-auth actions can run.
 */
export function GlobalAuthGate() {
  const { user, isAnonymous, loading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [feature, setFeature] = useState<GatedFeature>("generic");
  const [allowGuest, setAllowGuest] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<AuthGateDetail>).detail;
      setFeature(detail?.feature ?? "generic");
      // Guest mode is only offered from the landing page. Inside the app a
      // gate means the feature genuinely needs an account, so a guest option
      // there would dead-end the user on the thing they just tried to do.
      // This component mounts above the Router, so read the path directly
      // rather than via useLocation — and reading it here captures the path
      // at the moment the gate fired, which is what we actually want.
      setAllowGuest(window.location.pathname === "/");
      setIsOpen(true);
    };
    window.addEventListener("auth-gate-feature", handler);

    // Chat is now account-only; this only opens from explicit auth gates.

    return () => {
      window.removeEventListener("auth-gate-feature", handler);
    };
  }, []);

  // When an anonymous user creates a permanent account, close the modal
  // and broadcast completion so post-auth actions can run.
  const [wasAnon, setWasAnon] = useState<boolean | null>(null);
  useEffect(() => {
    if (loading) return;
    if (wasAnon === null) {
      setWasAnon(isAnonymous || !user);
      return;
    }
    if (wasAnon && user && !isAnonymous) {
      setIsOpen(false);
      window.dispatchEvent(new CustomEvent("arcai-auth-completed"));
    }
    setWasAnon(isAnonymous || !user);
  }, [user, isAnonymous, loading, wasAnon]);

  // The chat app also lives at "/", so the path alone isn't enough — the
  // lander is specifically "/" with nobody signed in. Once a guest session
  // exists, `user` is set and the offer correctly disappears.
  const showGuestOption = GUEST_CHAT_ENABLED && allowGuest && !user;

  return (
    <AuthModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      gatedFeature={feature}
      allowGuest={showGuestOption}
    />
  );
}
