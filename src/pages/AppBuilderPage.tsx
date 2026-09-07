import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIDEStore } from "@/store/useIDEStore";
import { IDECanvasPanel } from "@/components/ide/IDECanvasPanel";

export function AppBuilderPage() {
  const { projectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const setIdeProjectId = useIDEStore((s) => s.setIdeProjectId);

  useEffect(() => {
    if (projectId) {
      setIdeProjectId(projectId);
    }
  }, [projectId, setIdeProjectId]);

  const handleClose = () => {
    useIDEStore.getState().closeIDE();
    navigate('/dashboard?tab=apps');
  };

  if (authLoading) {
    return (
      <div className="h-screen w-screen bg-[#08090c] flex items-center justify-center">
        <div className="animate-pulse">
          <img src="/arc-logo-ui.png" alt="ArcAI" className="h-10 w-10" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] bg-[#08090c] h-[100dvh] max-h-[100dvh] w-screen max-w-full overflow-hidden flex flex-col">
      <IDECanvasPanel onClose={handleClose} />
    </div>
  );
}

export default AppBuilderPage;
