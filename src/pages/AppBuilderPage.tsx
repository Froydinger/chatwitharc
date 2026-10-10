import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIDEStore } from "@/store/useIDEStore";
import { AppBuilderWorkspace } from "@/components/app-builder/AppBuilderWorkspace";
import { AppBuilderDesktopNotice } from "@/components/app-builder/AppBuilderDesktopNotice";
import { useSubscription } from "@/hooks/useSubscription";
import { useAppBuilderDesktopAvailability } from "@/hooks/useAppBuilderDesktopAvailability";

export function AppBuilderPage() {
  const { projectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { hasBoost, isAdmin, loading: subscriptionLoading, openCheckout } = useSubscription();
  const desktopBuilderAvailable = useAppBuilderDesktopAvailability();
  const [hasMountedBuilder, setHasMountedBuilder] = useState(false);
  const setIdeProjectId = useIDEStore((s) => s.setIdeProjectId);
  const localDemo = import.meta.env.DEV && searchParams.get("demo") === "1";

  useEffect(() => {
    if (projectId && desktopBuilderAvailable) {
      setIdeProjectId(projectId);
    }
  }, [desktopBuilderAvailable, projectId, setIdeProjectId]);

  const accessDenied = desktopBuilderAvailable && !localDemo && !authLoading && !subscriptionLoading && (!user || (!hasBoost && !isAdmin));
  useEffect(() => {
    if (desktopBuilderAvailable && (localDemo || (!authLoading && !subscriptionLoading && !accessDenied))) {
      setHasMountedBuilder(true);
    }
  }, [accessDenied, authLoading, desktopBuilderAvailable, localDemo, subscriptionLoading]);
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

  const handleBackToChat = () => {
    useIDEStore.getState().closeIDE();
    const returnTo = location.state?.returnTo;
    navigate(typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/');
  };

  if (!desktopBuilderAvailable && !hasMountedBuilder) {
    return <AppBuilderDesktopNotice onBackToChat={handleBackToChat} />;
  }

  if (desktopBuilderAvailable && !localDemo && (authLoading || subscriptionLoading)) {
    return (
      <div className="h-screen w-screen bg-[#08090c] flex items-center justify-center">
        <div className="animate-pulse">
          <img src="/arc-logo-ui.png" alt="ArcAI" className="h-10 w-10" />
        </div>
      </div>
    );
  }


  if (desktopBuilderAvailable && !localDemo && accessDenied) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-[#08090c] h-[100dvh] max-h-[100dvh] w-screen max-w-full overflow-hidden flex flex-col">
      {(desktopBuilderAvailable || hasMountedBuilder) && (
        <div className={desktopBuilderAvailable ? 'h-full min-h-0' : 'hidden'} aria-hidden={!desktopBuilderAvailable}>
          <AppBuilderWorkspace projectId={projectId} demo={localDemo} onClose={handleClose} />
        </div>
      )}
      {!desktopBuilderAvailable && <AppBuilderDesktopNotice overlay onBackToChat={handleBackToChat} />}
    </div>
  );
}

export default AppBuilderPage;
