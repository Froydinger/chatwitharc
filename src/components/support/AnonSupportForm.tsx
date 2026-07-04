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
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

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
    setSubmitting(true);
    
    try {
      const formData = new URLSearchParams();
      formData.append("form-name", "support");
      formData.append("name", name);
      formData.append("email", email);
      formData.append("subject", subject);
      formData.append("message", message);
      
      const res = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });
      
      if (res.ok) {
        setSent(true);
        toast({ title: "Message sent!", description: "We have received your request and will respond shortly." });
      } else {
        throw new Error("Failed to send message via form handler");
      }
    } catch (err) {
      console.error("Netlify form submit failed:", err);
      toast({ 
        title: "Submission Error", 
        description: "There was a problem sending your message. Please try again.", 
        variant: "destructive" 
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pt-16 sm:p-6 sm:pt-20 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <GlassButton variant="ghost" size="icon" onClick={() => navigate("/")} className="rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </GlassButton>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Help Center</h1>
          <p className="text-sm text-muted-foreground">
            Get help with your account or send a ticket directly to the team.
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
              Send us a message and we'll reply directly to your email.
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
          <form 
            onSubmit={submit} 
            className="space-y-3" 
            name="support" 
            data-netlify="true"
          >
            <input type="hidden" name="form-name" value="support" />
            <div className="grid sm:grid-cols-2 gap-3">
              <Input 
                name="name"
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="Your name" 
                maxLength={100} 
                required 
              />
              <Input 
                type="email" 
                name="email"
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder="Your email" 
                maxLength={255} 
                required 
              />
            </div>
            <Input 
              name="subject"
              value={subject} 
              onChange={(e) => setSubject(e.target.value)} 
              placeholder="Subject" 
              maxLength={200} 
              required 
            />
            <Textarea 
              name="message"
              value={message} 
              onChange={(e) => setMessage(e.target.value)} 
              placeholder="How can we help?" 
              rows={6} 
              maxLength={2000} 
              required 
            />
            <div className="flex justify-end">
              <GlassButton type="submit" disabled={submitting}>
                {submitting ? "Sending..." : "Send Message"}
              </GlassButton>
            </div>
          </form>
        )}
      </GlassCard>
    </div>
  );
}

export default AnonSupportForm;
