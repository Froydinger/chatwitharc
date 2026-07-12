import { useEffect, useState } from "react";
import { ThemedLogo } from "@/components/ThemedLogo";

export function DesktopAuthCallbackPage() {
  const [status, setStatus] = useState<"working" | "done" | "failed">("working");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const port = params.get("port") || "48879";
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
      .catch((error) => {
        console.error("Desktop auth callback failed:", error);
        setStatus("failed");
      });
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
