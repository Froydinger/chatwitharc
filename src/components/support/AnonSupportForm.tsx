import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mail } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export function AnonSupportForm() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const submitting = false;
  const sent = false;

  // Force dark theme for the public support view.
  useEffect(() => {
    const root = document.documentElement;
    const hadLight = root.classList.contains("light");
    root.classList.remove("light");
    root.classList.add("dark");
    return () => {
      if (hadLight) {
        root.classList.remove("dark");
        root.classList.add("light");
      }
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    toast({ title: "Coming soon", description: "Anonymous email support is temporarily unavailable." });
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pt-16 sm:p-6 sm:pt-20 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <GlassButton variant="ghost" size="icon" onClick={() => navigate("/")} className="rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </GlassButton>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Support</h1>
          <p className="text-sm text-muted-foreground">
            Anonymous email support is coming soon. Sign in to open a trackable support ticket now.
          </p>
        </div>
      </div>

      <GlassCard className="p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
            <Mail className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Contact the ArcAI team</h2>
            <p className="text-xs text-muted-foreground">
              Coming soon — email delivery is temporarily unavailable.
            </p>
          </div>
        </div>

        {sent ? (
          <div className="text-center py-8">
            <p className="text-foreground font-medium mb-1">Thanks — your message is on its way.</p>
            <p className="text-sm text-muted-foreground">
              We'll respond directly to <span className="text-foreground">{email}</span>.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={100} required disabled />
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" maxLength={255} required disabled />
            </div>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" maxLength={200} required disabled />
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="How can we help?" rows={6} maxLength={2000} required disabled />
            <div className="flex justify-end">
              <GlassButton type="submit" disabled>
                Coming soon
              </GlassButton>
            </div>
          </form>
        )}
      </GlassCard>
    </div>
  );
}

export default AnonSupportForm;
