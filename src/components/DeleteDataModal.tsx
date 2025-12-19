import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";

interface DeleteDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteDataModal({ isOpen, onClose, onDeleted }: DeleteDataModalProps) {
  const [step, setStep] = useState<'warning' | 'confirm'>('warning');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleGetWarning = async () => {
    if (!supabase || !isSupabaseConfigured) {
      toast({
        title: "Error",
        description: "This feature is not available. Please try again later.",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase.functions.invoke('delete-user-data', {
        body: { action: 'get_warning' }
      });

      if (error) throw error;

      setConfirmationCode(data.confirmationCode);
      setStep('confirm');
    } catch (error) {
      console.error('Error getting warning:', error);
      toast({
        title: "Error",
        description: "Failed to load deletion confirmation",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (userInput !== confirmationCode) {
      toast({
        title: "Invalid Code",
        description: "Please enter the exact confirmation code shown above",
        variant: "destructive"
      });
      return;
    }

    if (!supabase || !isSupabaseConfigured) {
      toast({
        title: "Error",
        description: "This feature is not available. Please try again later.",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase.functions.invoke('delete-user-data', {
        body: {
          action: 'confirm_delete',
          confirmationCode: userInput
        }
      });

      if (error) throw error;

      toast({
        title: "Data Deleted Successfully",
        description: "All your data has been permanently deleted from our servers",
        variant: "default"
      });

      onDeleted();
      onClose();
    } catch (error) {
      console.error('Error deleting data:', error);
      toast({
        title: "Deletion Failed",
        description: "Failed to delete your data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setStep('warning');
    setConfirmationCode('');
    setUserInput('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Permanent Data Deletion
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. Please read carefully.
          </DialogDescription>
        </DialogHeader>

        {step === 'warning' && (
          <div className="space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <div className="font-semibold text-destructive mb-2">
                ⚠️ WARNING: PERMANENT DELETE ⚠️
              </div>
              <div className="text-sm space-y-2">
                <p>This action will <strong>permanently delete</strong>:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>All your chat sessions and conversations</li>
                  <li>Your profile information and memory data</li>
                  <li>All stored personal data</li>
                </ul>
                <p className="font-semibold text-destructive mt-3">
                  This action CANNOT be undone.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleGetWarning}
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? "Loading..." : "I Understand, Continue"}
              </Button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <div className="font-semibold text-destructive mb-2">
                Final Confirmation Required
              </div>
              <p className="text-sm mb-3">
                Type the confirmation code below to permanently delete all your data:
              </p>
              <div className="bg-muted p-2 rounded font-mono text-sm break-all">
                {confirmationCode}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Enter confirmation code:</label>
              <Input
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Type the confirmation code exactly as shown"
                className="font-mono"
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleConfirmDelete}
                disabled={isLoading || userInput !== confirmationCode}
                className="flex-1"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {isLoading ? "Deleting..." : "Delete Forever"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}