import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Send, CheckCircle2 } from "lucide-react";

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorMessage?: string;
  errorStack?: string;
}

export function BugReportModal({ isOpen, onClose, errorMessage = "", errorStack = "" }: BugReportModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState(user?.email || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!description.trim() && !errorMessage.trim()) {
      toast({ title: "Please describe what happened", description: "Provide a brief description of the issue.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      if (!supabase) throw new Error("Supabase client not available");

      const bugPayload = {
        user_id: user?.id || null,
        user_email: email || user?.email || "anonymous",
        error_message: errorMessage || "User Reported Bug",
        error_stack: errorStack || null,
        user_description: description.trim() || null,
        url: window.location.href,
        user_agent: navigator.userAgent,
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("bug_reports").insert([bugPayload]);
      if (error) throw error;

      // Dispatch admin email alert via Resend
      void supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "bug-report",
          recipientEmail: "jakefreudinger@gmail.com",
          templateData: {
            userEmail: bugPayload.user_email,
            description: bugPayload.user_description,
            errorMessage: bugPayload.error_message,
            errorStack: bugPayload.error_stack,
            url: bugPayload.url,
            userAgent: bugPayload.user_agent,
          },
        },
      }).catch((e) => console.warn("Failed to dispatch bug alert email:", e));

      setIsSubmitted(true);
      toast({
        title: "Bug Report Sent",
        description: "Thank you for reporting this issue. Our team has received your report.",
      });

      setTimeout(() => {
        setIsSubmitted(false);
        setDescription("");
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error("Failed to submit bug report:", err);
      toast({
        title: "Submission Error",
        description: err?.message || "Failed to submit bug report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl glass border-destructive/20">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Report a Bug
          </DialogTitle>
          <DialogDescription>
            Help us fix this issue by sharing what you were doing when the error occurred.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Error Message */}
          {errorMessage && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Error Details</Label>
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <code className="text-xs text-destructive break-all">{errorMessage}</code>
              </div>
            </div>
          )}

          {/* User Email */}
          <div className="space-y-2">
            <Label htmlFor="email">Email (for follow-up)</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="glass border-glass-border"
              disabled={isSubmitting || isSubmitted}
            />
          </div>

          {/* User Description */}
          <div className="space-y-2">
            <Label htmlFor="description">What happened? *</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what you were doing when the error occurred..."
              className="glass border-glass-border min-h-[120px]"
              disabled={isSubmitting || isSubmitted}
            />
          </div>

          {/* Error Stack */}
          {errorStack && (
            <details className="space-y-2">
              <summary className="text-sm font-medium cursor-pointer text-muted-foreground hover:text-foreground">
                Technical Details (click to expand)
              </summary>
              <div className="mt-2 p-3 rounded-lg bg-muted/50 border border-border/40 max-h-40 overflow-auto">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all">{errorStack}</pre>
              </div>
            </details>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting} className="glass">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || isSubmitted}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-2"
          >
            {isSubmitted ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                Submitted
              </>
            ) : isSubmitting ? (
              "Sending..."
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Bug Report
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
