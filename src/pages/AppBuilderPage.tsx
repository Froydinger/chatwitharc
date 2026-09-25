import { useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIDEStore } from "@/store/useIDEStore";
import { AppBuilderWorkspace } from "@/components/app-builder/AppBuilderWorkspace";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";

export function AppBuilderPage() {
  const { projectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { hasBoost, isAdmin, loading: subscriptionLoading, openCheckout } = useSubscription();
  const setIdeProjectId = useIDEStore((s) => s.setIdeProjectId);
  const localDemo = import.meta.env.DEV && searchParams.get("demo") === "1";

  useEffect(() => {
    if (projectId) {
      setIdeProjectId(projectId);
    }
  }, [projectId, setIdeProjectId]);

  const handleClose = () => {
    useIDEStore.getState().closeIDE();
    navigate('/dashboard?tab=apps');
  };

  // The local-only design route makes it possible to inspect desktop and phone
  // layouts without authentication, provider calls, or any production data.
  if (localDemo) {
    return <AppBuilderWorkspace projectId={projectId} demo onClose={handleClose} />;
  }

  if (authLoading || (!localDemo && subscriptionLoading)) {
    return (
      <div className="h-screen w-screen bg-[#08090c] flex items-center justify-center">
        <div className="animate-pulse">
          <img src="/arc-logo-ui.png" alt="ArcAI" className="h-10 w-10" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#08090c] px-6 text-center text-white">
        <div className="max-w-sm">
          <p className="text-lg font-semibold">Sign in to open App Builder</p>
          <p className="mt-2 text-sm text-white/45">Your apps are private to your account.</p>
          <Button onClick={() => navigate("/")} className="mt-5 rounded-full bg-white px-5 text-black hover:bg-white/90">Go to Arc</Button>
        </div>
      </div>
    );
  }

  if (!hasBoost && !isAdmin) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#08090c] px-6 text-center text-white">
        <div className="max-w-sm">
          <p className="text-lg font-semibold">App Builder is part of Boost</p>
          <p className="mt-2 text-sm text-white/45">Upgrade to build, edit, and publish private Arc apps.</p>
          <Button onClick={() => openCheckout()} className="mt-5 rounded-full bg-white px-5 text-black hover:bg-white/90">Explore Boost</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] bg-[#08090c] h-[100dvh] max-h-[100dvh] w-screen max-w-full overflow-hidden flex flex-col">
      <AppBuilderWorkspace projectId={projectId} onClose={handleClose} />
    </div>
  );
}

export default AppBuilderPage;
