import { useState, useCallback } from 'react';

const GUEST_MESSAGE_KEY = 'arcai-guest-messages';
const GUEST_LIMIT = 5;

function getGuestMessageCount(): number {
  try {
    return parseInt(localStorage.getItem(GUEST_MESSAGE_KEY) || '0', 10);
  } catch {
    return 0;
  }
}

function incrementGuestMessages(): number {
  const count = getGuestMessageCount() + 1;
  localStorage.setItem(GUEST_MESSAGE_KEY, String(count));
  return count;
}

export function useGuestMode() {
  const [messageCount, setMessageCount] = useState(getGuestMessageCount);
  const [showSignupPrompt, setShowSignupPrompt] = useState(false);

  const canSendMessage = messageCount < GUEST_LIMIT;
  const remainingMessages = Math.max(0, GUEST_LIMIT - messageCount);

  const recordGuestMessage = useCallback(() => {
    const newCount = incrementGuestMessages();
    setMessageCount(newCount);
    if (newCount >= GUEST_LIMIT) {
      setShowSignupPrompt(true);
    }
  }, []);

  const dismissSignupPrompt = useCallback(() => {
    setShowSignupPrompt(false);
  }, []);

  return {
    messageCount,
    canSendMessage,
    remainingMessages,
    showSignupPrompt,
    setShowSignupPrompt,
    recordGuestMessage,
    dismissSignupPrompt,
    GUEST_LIMIT,
  };
}
