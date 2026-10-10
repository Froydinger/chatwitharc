import { useEffect } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIDEStore } from "@/store/useIDEStore";
import { AppBuilderWorkspace } from "@/components/app-builder/AppBuilderWorkspace";
import { useSubscription } from "@/hooks/useSubscription";
import { useIsMobile } from "@/hooks/use-mobile";
import { isMobileBuilderViewport } from "@/lib/builderViewport";

export function AppBuilderPage() {
  const { projectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { hasBoost, isAdmin, loading: subscriptionLoading, openCheckout } = useSubscription();
  const isMobile = useIsMobile();
  const mobileBuilderRoute = isMobile || (typeof window !== "undefined" && isMobileBuilderViewport(window.innerWidth));
  const setIdeProjectId = useIDEStore((s) => s.setIdeProjectId);
  const localDemo = import.meta.env.DEV && searchParams.get("demo") === "1";

  useEffect(() => {
    if (projectId && !mobileBuilderRoute) {
      setIdeProjectId(projectId);
    }
  }, [mobileBuilderRoute, projectId, setIdeProjectId]);

  const accessDenied = !mobileBuilderRoute && !localDemo && !authLoading && !subscriptionLoading && (!user || (!hasBoost && !isAdmin));
  useEffect(() => {
    if (!accessDenied) return;
    navigate('/', { replace: true });
    openCheckout(undefined, 'app_builder');
  }, [accessDenied, navigate, openCheckout]);

  const handleClose = () => {
    useIDEStore.getState().closeIDE();
    const returnTo = location.state?.returnTo === '/' ? '/' : '/dashboard?tab=apps';
    navigate(returnTo);
  };

  if (mobileBuilderRoute) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center bg-background p-6 text-foreground">
        <section className="w-full max-w-sm rounded-3xl border border-border/60 bg-card p-6 text-center shadow-lg">
          <h1 className="text-xl font-semibold">Open on desktop</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            App Builder is available on desktop. Your saved projects and running jobs stay available when you return there.
          </p>
        </section>
      </main>
    );
  }

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


  if (accessDenied) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-[#08090c] h-[100dvh] max-h-[100dvh] w-screen max-w-full overflow-hidden flex flex-col">
      <AppBuilderWorkspace projectId={projectId} onClose={handleClose} />
    </div>
  );
}

export default AppBuilderPage;
