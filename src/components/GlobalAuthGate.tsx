import { useEffect, useState } from "react";
import { AuthModal } from "@/components/AuthModal";
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

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<AuthGateDetail>).detail;
      setFeature(detail?.feature ?? "generic");
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

  return (
    <AuthModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      gatedFeature={feature}
    />
  );
}
