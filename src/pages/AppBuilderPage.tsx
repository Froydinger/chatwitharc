import { useEffect } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIDEStore } from "@/store/useIDEStore";
import { AppBuilderWorkspace } from "@/components/app-builder/AppBuilderWorkspace";
import { useSubscription } from "@/hooks/useSubscription";

export function AppBuilderPage() {
  const { projectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
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

  const accessDenied = !localDemo && !authLoading && !subscriptionLoading && (!user || (!hasBoost && !isAdmin));
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
