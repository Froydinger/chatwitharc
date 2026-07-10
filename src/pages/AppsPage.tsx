import { useNavigate } from "react-router-dom";
import { Code2, Hammer, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-border/50 bg-card/70 backdrop-blur-xl shadow-2xl p-8 text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <Hammer className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-500">
            <Wrench className="h-3 w-3" />
            Coming Soon
          </div>
          <h1 className="text-2xl font-bold tracking-tight">App Builder is paused</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            The IDE workspace is offline while we rebuild it. Use the regular code canvas for single-file HTML, CSS, JavaScript, and React-style prototypes for now.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Button onClick={() => navigate("/")} className="rounded-xl">
            Back to Chat
          </Button>
          <Button variant="outline" onClick={() => navigate("/docs")} className="rounded-xl gap-2">
            <Code2 className="h-4 w-4" />
            Code Canvas Docs
          </Button>
        </div>
      </div>
    </div>
  );
}
