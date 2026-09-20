import { useLocation, useParams } from "react-router-dom";
import { SEO } from "./SEO";

interface RouteMeta {
  title: string;
  description: string;
}

const ROUTE_META: Record<string, RouteMeta> = {
  "/": {
    title: "ArcAI • Ask, Reflect, Create",
    description:
      "Talk naturally with Arc in real-time voice, generate images, write code and prose in one place. Free multimodal AI with 3 voice sessions per UTC day up to 10 minutes each and living memory.",
  },
  "/pricing": {
    title: "ArcAI • Pricing",
    description:
      "ArcAI includes Arc Matrix™ intelligence with Ava, Maya, and River reasoning, plus 3 voice sessions per UTC day up to 10 minutes each, Deep Search, and shared chats.",
  },
  "/downloads": {
    title: "ArcAI • Downloads",
    description:
      "Download ArcAI for macOS or try the Windows beta. Use the web app any time from your browser, dock, or home screen.",
  },
  "/dashboard": {
    title: "ArcAI • Dashboard",
    description:
      "Your ArcAI hub: chats, canvases, images, deploys, music and memory all in one place.",
  },
  "/dashboard/settings": {
    title: "ArcAI • Settings",
    description:
      "Manage your ArcAI account, theme, voice, memory and usage preferences.",
  },
  "/support": {
    title: "ArcAI • Support",
    description:
      "Open a ticket or get help with ArcAI. Real humans, fast replies, no runaround.",
  },
  "/admin": {
    title: "ArcAI • Admin",
    description: "ArcAI admin tools.",
  },
  "/unsubscribe": {
    title: "ArcAI • Unsubscribe",
    description: "Manage email preferences for ArcAI.",
  },
  "/terms": {
    title: "ArcAI • Terms",
    description: "ArcAI terms of service and refund policy.",
  },
  "/privacy": {
    title: "ArcAI • Privacy",
    description: "ArcAI privacy policy.",
  },
  "/welcome": {
    title: "ArcAI — Free AI Assistant with Voice, Images & Memory",
    description:
      "ArcAI is a free multimodal AI assistant with natural voice conversations, 3 voice sessions per UTC day up to 10 minutes each, Arc Imagix image generation, code and living memory. A free ChatGPT, Gemini and Claude alternative.",
  },
  "/blog": {
    title: "ArcAI Guides & FAQs — Free AI Assistant",
    description:
      "Guides and FAQs about ArcAI, the free AI assistant with voice, image generation, code and memory.",
  },
  "/upgrade": {
    title: "ArcAI • Upgrade to Boost",
    description:
      "Upgrade your ArcAI account to Boost for unlimited Deep Search and Ultra Deep Search, unlimited Ava, Maya, and River reasoning, unlimited Arc Imagix generation & editing, and unlimited voice sessions up to 2 hours each.",
  },
  "/share": {
    title: "ArcAI • Shared Conversation",
    description:
      "Read this shared ArcAI conversation with reasoning, search, and coding context.",
  },
  "/tasks": {
    title: "ArcAI • Tasks",
    description:
      "View and manage your scheduled reminder tasks and automated actions.",
  },
  "/shared": {
    title: "ArcAI • Shared Rooms",
    description:
      "View and collaborate in shared project workspaces and chat rooms.",
  },
  "/build": {
    title: "ArcAI • App Builder",
    description:
      "Build, preview, and deploy full React applications powered by Arc Matrix™.",
  },
  "/docs": {
    title: "ArcAI • Docs",
    description:
      "Guides, tutorials, and documentation for ArcAI features, models, and tools.",
  },
  "/status": {
    title: "ArcAI • Status",
    description:
      "Real-time service and system status for ArcAI.",
  },
  "/checkout/return": {
    title: "ArcAI • Checkout Completed",
    description:
      "Thank you for upgrading to ArcAI Boost. Your subscription features are ready.",
  },
};

export const RouteSEO = () => {
  const location = useLocation();
  const params = useParams();
  let path = location.pathname;

  // Normalize trailing slash
  if (path.length > 1 && path.endsWith("/")) {
    path = path.replace(/\/+$/, "");
  }

  // Normalize dynamic chat routes to a canonical /chat path
  if (path.startsWith("/chat/")) {
    path = "/chat";
  }
  if (path.startsWith("/share/")) {
    path = "/share";
  }
  if (path.startsWith("/shared/")) {
    path = "/shared";
  }
  if (path.startsWith("/build")) {
    path = "/build";
  }
  if (path.startsWith("/dashboard") && path !== "/dashboard/settings") {
    path = "/dashboard";
  }

  // Let per-post <Helmet> in BlogPostPage own SEO for /blog/:slug.
  if (path.startsWith("/blog/")) {
    return null;
  }

  const meta =
    ROUTE_META[path] ??
    ROUTE_META[location.pathname] ??
    (path === "/chat"
      ? {
          title: "ArcAI • Chat",
          description:
            "Continue your ArcAI conversation with memory, voice and creative tools.",
        }
      : {
          title: "ArcAI • Page Not Found",
          description:
            "Talk naturally with Arc in real-time voice, generate images, write code and prose in one place. Free multimodal AI with 3 voice sessions per UTC day up to 10 minutes each and living memory.",
        });

  return <SEO title={meta.title} description={meta.description} path={path} />;
};
