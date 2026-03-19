import { AlertTriangle } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { motion, AnimatePresence } from "framer-motion";

export function PaymentFailureBanner() {
  const { paymentStatus, openCustomerPortal } = useSubscription();

  if (paymentStatus !== 'past_due') return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="mx-4 mt-2 p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 backdrop-blur-sm flex items-center gap-3"
      >
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        <p className="text-xs text-amber-200 flex-1">
          Your last payment failed. Update your payment method to keep Pro access.
        </p>
        <button
          onClick={() => openCustomerPortal()}
          className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors whitespace-nowrap"
        >
          Fix now
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
