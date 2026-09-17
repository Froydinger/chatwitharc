import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { DashboardPreviewPage } from "./DashboardPreviewPage";

/**
 * Keep the auth gate outside the dashboard implementation so the route can be
 * code-split without making the preview shell import the route back again.
 */
export function DashboardRoute() {
  const navigate = useNavigate();
  const { user, loading: authLoading, isAnonymous } = useAuth();
  const signedOut = !authLoading && (isAnonymous || !user);

  useEffect(() => {
    if (!signedOut) return;
    navigate("/", { replace: true });
    window.dispatchEvent(
      new CustomEvent("auth-gate-feature", { detail: { feature: "menu" } }),
    );
  }, [signedOut, navigate]);

  if (signedOut) return null;
  return <DashboardPreviewPage live />;
}
