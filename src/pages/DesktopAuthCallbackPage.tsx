import { useEffect, useState } from "react";
import { ThemedLogo } from "@/components/ThemedLogo";

export function DesktopAuthCallbackPage() {
  const [status, setStatus] = useState<"working" | "done" | "failed">("working");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const port = params.get("port");
    if (port !== "48879") {
      setStatus("failed");
      return;
    }

    if (params.get("transport") !== "loopback-get") {
      const endpoint = `http://127.0.0.1:${port}/auth-callback`;
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ href: window.location.href }),
      })
        .then((response) => {
          if (!response.ok) throw new Error("Desktop app did not accept auth callback");
          setStatus("done");
          setTimeout(() => window.close(), 1200);
        })
        .catch(() => setStatus("failed"));
      return;
    }

    const nonce = params.get("bridge_nonce");
    if (!nonce || !/^[A-Za-z0-9_-]{32,128}$/.test(nonce)) {
      setStatus("failed");
      return;
    }

    // A top-level navigation avoids Safari's restrictions on HTTPS pages
    // issuing cross-origin fetches to loopback addresses. The desktop bridge
    // validates the callback URL before handing it to the app.
    const callbackHref = window.location.href;
    const endpoint = new URL(`http://127.0.0.1:${port}/auth-callback`);
    endpoint.searchParams.set("href", callbackHref);
    endpoint.searchParams.set("nonce", nonce);
    window.history.replaceState(null, document.title, "/desktop-auth-callback");
    window.location.replace(endpoint.toString());
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="max-w-sm text-center space-y-5">
        <div className="mx-auto h-16 w-16">
          <ThemedLogo className="h-full w-full" alt="ArcAI" />
        </div>
        {status === "working" && (
          <>
            <h1 className="text-2xl font-semibold">Finishing sign in...</h1>
            <p className="text-sm text-muted-foreground">Keep ArcAI open. This tab will close when the app receives your sign-in.</p>
          </>
        )}
        {status === "done" && (
          <>
            <h1 className="text-2xl font-semibold">You are signed in.</h1>
            <p className="text-sm text-muted-foreground">Return to ArcAI.</p>
          </>
        )}
        {status === "failed" && (
          <>
            <h1 className="text-2xl font-semibold">ArcAI did not receive the sign-in.</h1>
            <p className="text-sm text-muted-foreground">Open ArcAI and try Google sign-in again.</p>
          </>
        )}
      </div>
    </div>
  );
}
