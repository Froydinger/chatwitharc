import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle2, AlertCircle, ArrowRight, Check } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { GlassButton } from "@/components/ui/glass-button";
import { BOOST_PLAN_FEATURES } from "@/lib/planCopy";
import { useArcStore } from "@/store/useArcStore";

export default function CheckoutReturnPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const navigate = useNavigate();
  const { checkSubscription } = useSubscription();
  const createNewSession = useArcStore((state) => state.createNewSession);
  
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      setErrorMessage("No checkout session ID found in the URL.");
      return;
    }

    let isMounted = true;

    async function verifyCheckout() {
      try {
        console.log("Verifying checkout session:", sessionId);
        const { data, error } = await supabase.functions.invoke("create-checkout", {
          body: {
            action: "verify",
            sessionId,
            environment: getStripeEnvironment(),
          },
        });

        if (error) {
          console.error("Verification Edge Function error:", error);
          throw new Error(error.message || "Failed to verify payment session.");
        }

        if (data?.success) {
          console.log("Payment verified successfully!");
          // Refresh user's subscription entitlement state
          await checkSubscription();
          
          if (isMounted) {
            setStatus("success");
          }
        } else {
          throw new Error(data?.error || "Payment session is incomplete or unpaid.");
        }
      } catch (err: any) {
        console.error("Checkout verification exception:", err);
        if (isMounted) {
          setStatus("error");
          setErrorMessage(err?.message || String(err) || "Failed to verify subscription.");
        }
      }
    }

    verifyCheckout();

    return () => {
      isMounted = false;
    };
  }, [sessionId, checkSubscription, navigate]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#09090b] text-foreground p-6">
      <div className="w-full max-w-md p-8 rounded-3xl border border-white/5 bg-[#121214]/60 backdrop-blur-2xl text-center shadow-2xl flex flex-col items-center">
        {status === "loading" && (
          <>
            <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight mb-2">Upgrading your account</h2>
            <p className="text-muted-foreground text-sm max-w-xs">
              Verifying your payment details with Stripe. This will only take a moment...
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 mb-6 animate-pulse">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight mb-2 text-emerald-500">Welcome to Boost!</h2>
            <p className="text-muted-foreground text-sm max-w-sm mb-5">
              Your subscription is active. Here&apos;s what you just unlocked:
            </p>
            <ul className="w-full max-w-sm text-left space-y-2.5 mb-7">
              {BOOST_PLAN_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground/90">
                  <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <GlassButton
              className="w-full bg-primary text-primary-foreground hover:bg-primary/95 font-semibold py-6 rounded-xl"
              onClick={() => {
                const newSessionId = createNewSession();
                navigate(`/chat/${newSessionId}`, { replace: true });
              }}
            >
              Chat with Arc <ArrowRight className="h-4 w-4 ml-2" />
            </GlassButton>
          </>
        )}

        {status === "error" && (
          <>
            <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mb-6">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight mb-2 text-destructive">Verification Failed</h2>
            <p className="text-muted-foreground text-sm max-w-xs mb-6">
              {errorMessage || "We couldn't confirm your subscription. Please contact support if you were charged."}
            </p>
            <GlassButton onClick={() => navigate("/")} className="w-full">
              Return to Home
            </GlassButton>
          </>
        )}
      </div>
    </div>
  );
}
