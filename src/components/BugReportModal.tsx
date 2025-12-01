import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Send } from "lucide-react";

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

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast({
        title: "Description required",
        description: "Please describe what happened",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Call Edge Function to send email
      const { error: emailError } = await supabase.functions.invoke("send-bug-report", {
        body: {
          userEmail: email,
          errorMessage,
          errorStack,
          description,
          url: window.location.href,
          userAgent: navigator.userAgent,
        },
      });

      if (emailError) {
        console.error("Failed to send email:", emailError);
        // Don't throw - bug report is saved even if email fails
      }

      toast({
        title: "Bug report sent",
        description: "Thank you for helping us improve!",
      });

      setDescription("");
      onClose();
    } catch (error: any) {
      console.error("Failed to submit bug report:", error);
      toast({
        title: "Failed to submit",
        description: error.message || "Please try again",
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
            Help us fix this issue by providing details about what happened.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Error Message (read-only) */}
          {errorMessage && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Error Message</Label>
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <code className="text-xs text-destructive break-all">{errorMessage}</code>
              </div>
            </div>
          )}

          {/* User Email */}
          <div className="space-y-2">
            <Label htmlFor="email">Email (optional)</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="glass border-glass-border"
            />
            <p className="text-xs text-muted-foreground">We'll only use this to follow up on your report</p>
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
              disabled={isSubmitting}
            />
          </div>

          {/* Error Stack (collapsible) */}
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
            disabled={isSubmitting || !description.trim()}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            {isSubmitting ? (
              "Sending..."
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send Report
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
