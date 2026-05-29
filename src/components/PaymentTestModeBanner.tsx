const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken) return null; // silent — Boost is optional, no need to scare free users
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full bg-amber-500/15 border-b border-amber-500/30 px-4 py-1.5 text-center text-xs text-amber-200">
        Boost checkout is in <strong>test mode</strong> — use card <code className="font-mono">4242 4242 4242 4242</code> to try it.
      </div>
    );
  }
  return null;
}
