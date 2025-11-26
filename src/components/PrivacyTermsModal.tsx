import { useState } from "react";
import { FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PrivacyTermsModalProps {
  trigger?: React.ReactNode;
}

export function PrivacyTermsModal({ trigger }: PrivacyTermsModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  const defaultTrigger = (
    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
      <FileText className="h-4 w-4 mr-2" />
      Privacy & Terms
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Privacy Policy & Terms of Service
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6 text-sm">
            
            {/* Privacy Policy */}
            <section>
              <h2 className="text-lg font-semibold mb-3">Privacy Policy</h2>
              
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-2">No Data Collection</h3>
                  <p className="text-muted-foreground">
                    <strong>We do not collect any data in-app.</strong> Your conversations and information are stored 
                    locally or on secure servers solely to provide the service to you. We do not track, analyze, or 
                    share your personal information with third parties.
                  </p>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Data Storage & Retention</h3>
                  <p className="text-muted-foreground">
                    Your data is stored securely on our servers. <strong>When you delete your data, it is permanently 
                    removed from our systems and cannot be recovered.</strong> Unlike other services, we do not maintain 
                    backups or copies of deleted user data.
                  </p>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Third-Party Services</h3>
                  <p className="text-muted-foreground">
                    We use Lovable AI's services (powered by Google Gemini) to provide AI responses. Lovable AI may retain 
                    data according to their own policies. Please review Lovable's privacy policy for more information.
                  </p>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Updates & Changelogs</h3>
                  <p className="text-muted-foreground">
                    For the latest downloads and updates, visit our main site at{" "}
                    <a href="https://chatwitharc.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      chatwitharc.com
                    </a>. When we start listing changelogs, they will be available on both the main page and in your 
                    settings panel in a popup.
                  </p>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Contact</h3>
                  <p className="text-muted-foreground">
                    For privacy-related questions, contact us at: <strong>arc@froydinger.com</strong>
                  </p>
                </div>
              </div>
            </section>

            {/* Terms of Service */}
            <section>
              <h2 className="text-lg font-semibold mb-3">Terms of Service</h2>
              
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-2">Service Availability</h3>
                  <p className="text-muted-foreground">
                    We provide this service "as is" without warranties. Service availability and features may change 
                    without notice.
                  </p>
                </div>

                <div>
                  <h3 className="font-medium mb-2">User Responsibility</h3>
                  <p className="text-muted-foreground">
                    You are responsible for your data and how you use our service. We are not liable for any loss, 
                    damage, or consequences resulting from your use of our service.
                  </p>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Data Loss & Deletion</h3>
                  <p className="text-muted-foreground">
                    <strong>We are not responsible for any data loss, whether accidental or intentional.</strong> When 
                    you delete data, it is permanently removed and cannot be recovered. Backup your important 
                    conversations before deletion.
                  </p>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Limitation of Liability</h3>
                  <p className="text-muted-foreground">
                    Our liability is limited to the maximum extent permitted by law. We are not responsible for any 
                    indirect, incidental, or consequential damages arising from your use of our service.
                  </p>
                </div>

                <div>
                  <h3 className="font-medium mb-2">AI-Generated Content</h3>
                  <p className="text-muted-foreground">
                    AI responses are generated by third-party services and may not be accurate. You use AI-generated 
                    content at your own risk.
                  </p>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Changes to Terms</h3>
                  <p className="text-muted-foreground">
                    We may update these terms at any time. Continued use of the service constitutes acceptance of 
                    updated terms.
                  </p>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Contact & Support</h3>
                  <p className="text-muted-foreground">
                    For questions about these terms, contact: <strong>arc@froydinger.com</strong>
                  </p>
                </div>
              </div>
            </section>

            <div className="text-xs text-muted-foreground pt-4 border-t">
              <p>Last updated: {new Date().toLocaleDateString()}</p>
              <p className="mt-2">
                By using this service, you acknowledge that you have read and agree to these terms and privacy policy.
              </p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}