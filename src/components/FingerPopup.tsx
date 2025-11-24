import { useFingerPopup } from '@/hooks/use-finger-popup';
import { useEffect, useState } from 'react';

export function FingerPopupContainer() {
  const popups = useFingerPopup((state) => state.popups);

  return (
    <>
      {popups.map((popup) => (
        <FingerPopup
          key={popup.id}
          message={popup.message}
          x={popup.x}
          y={popup.y}
        />
      ))}
    </>
  );
}

interface FingerPopupProps {
  message: string;
  x: number;
  y: number;
}

function FingerPopup({ message, x, y }: FingerPopupProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger animation shortly after mount
    requestAnimationFrame(() => {
      setIsVisible(true);
    });

    // Start fade out before removal
    const fadeOutTimer = setTimeout(() => {
      setIsVisible(false);
    }, 1200);

    return () => clearTimeout(fadeOutTimer);
  }, []);

  // Position the popup directly above the button
  const offsetY = -60;

  return (
    <div
      className={`
        fixed z-[9999] pointer-events-none
        px-4 py-2 rounded-full
        bg-primary/95 text-primary-foreground
        shadow-lg border border-primary/20
        text-sm font-medium whitespace-nowrap
        transition-all duration-300
        ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}
      `}
      style={{
        left: `${x}px`,
        top: `${y + offsetY}px`,
        transform: 'translate(-50%, -100%)',
      }}
    >
      {message}
    </div>
  );
}
