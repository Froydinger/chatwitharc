import { useFingerPopup } from '@/hooks/use-finger-popup';
import { motion, AnimatePresence } from 'framer-motion';

export function FingerPopupContainer() {
  const popups = useFingerPopup((state) => state.popups);

  return (
    <AnimatePresence>
      {popups.map((popup) => (
        <FingerPopup
          key={popup.id}
          message={popup.message}
          x={popup.x}
          y={popup.y}
        />
      ))}
    </AnimatePresence>
  );
}

interface FingerPopupProps {
  message: string;
  x: number;
  y: number;
}

function FingerPopup({ message, x, y }: FingerPopupProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{
        type: "spring",
        stiffness: 500,
        damping: 15,
        mass: 0.5
      }}
      className="fixed z-[9999] pointer-events-none px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap backdrop-blur-xl bg-green-500/20 border-2 border-green-400/60 text-white shadow-[0_0_24px_rgba(34,197,94,0.4)]"
      style={{
        left: `${x - 60}px`,
        top: `${y - 70}px`,
        transform: 'translateX(-50%)',
      }}
    >
      {message}
    </motion.div>
  );
}
